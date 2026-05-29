const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JSON_FILE_PATH = path.join(__dirname, 'schedules.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let dbAdapter = null;

function initJsonFile() {
  if (!fs.existsSync(JSON_FILE_PATH)) {
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify([], null, 2));
  }
}

const JSONAdapter = {
  name: 'JSON File (schedules.json)',
  async getSchedules() {
    initJsonFile();
    const data = fs.readFileSync(JSON_FILE_PATH, 'utf8');
    return JSON.parse(data);
  },
  async addSchedule({ title, description, schedule_datetime, hourly_reminder, priority, ringtone }) {
    initJsonFile();
    const schedules = await this.getSchedules();
    const newSchedule = {
      id: Date.now(),
      title,
      description: description || '',
      schedule_datetime,
      hourly_reminder: !!hourly_reminder,
      priority: priority || 'medium',
      ringtone: ringtone || 'default',
      is_completed: false,
      last_reminded_at: null,
      reminder_count: 0,
      completed_at: null,
      created_at: new Date().toISOString()
    };
    schedules.push(newSchedule);
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
    return newSchedule;
  },
  async completeSchedule(id) {
    initJsonFile();
    const schedules = await this.getSchedules();
    const index = schedules.findIndex((schedule) => schedule.id === parseInt(id, 10));
    if (index === -1) return false;

    schedules[index].is_completed = true;
    schedules[index].completed_at = new Date().toISOString();
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
    return true;
  },
  async updateRemindedTime(id, datetime) {
    initJsonFile();
    const schedules = await this.getSchedules();
    const index = schedules.findIndex((schedule) => schedule.id === parseInt(id, 10));
    if (index === -1) return false;

    schedules[index].last_reminded_at = datetime;
    schedules[index].reminder_count = (schedules[index].reminder_count || 0) + 1;
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
    return true;
  },
  async deleteSchedule(id) {
    initJsonFile();
    const schedules = await this.getSchedules();
    const nextSchedules = schedules.filter((schedule) => schedule.id !== parseInt(id, 10));
    if (nextSchedules.length === schedules.length) return false;

    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(nextSchedules, null, 2));
    return true;
  }
};

class PostgresAdapter {
  constructor(pool) {
    this.pool = pool;
    this.name = 'Supabase PostgreSQL';
  }

  async getSchedules() {
    const { rows } = await this.pool.query(`
      SELECT
        id,
        title,
        description,
        to_char(schedule_datetime, 'YYYY-MM-DD"T"HH24:MI') AS schedule_datetime,
        hourly_reminder,
        priority,
        ringtone,
        is_completed,
        last_reminded_at,
        reminder_count,
        completed_at,
        created_at
      FROM schedules
      ORDER BY schedule_datetime ASC
    `);
    return rows;
  }

  async addSchedule({ title, description, schedule_datetime, hourly_reminder, priority, ringtone }) {
    const { rows } = await this.pool.query(
      `INSERT INTO schedules
        (title, description, schedule_datetime, hourly_reminder, priority, ringtone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
        id,
        title,
        description,
        to_char(schedule_datetime, 'YYYY-MM-DD"T"HH24:MI') AS schedule_datetime,
        hourly_reminder,
        priority,
        ringtone,
        is_completed,
        last_reminded_at,
        reminder_count,
        completed_at,
        created_at`,
      [
        title,
        description || null,
        schedule_datetime,
        !!hourly_reminder,
        priority || 'medium',
        ringtone || 'default'
      ]
    );

    return rows[0];
  }

  async completeSchedule(id) {
    const result = await this.pool.query(
      'UPDATE schedules SET is_completed = true, completed_at = now() WHERE id = $1',
      [id]
    );
    return result.rowCount > 0;
  }

  async updateRemindedTime(id, datetime) {
    const result = await this.pool.query(
      'UPDATE schedules SET last_reminded_at = $1, reminder_count = reminder_count + 1 WHERE id = $2',
      [datetime, id]
    );
    return result.rowCount > 0;
  }

  async deleteSchedule(id) {
    const result = await this.pool.query('DELETE FROM schedules WHERE id = $1', [id]);
    return result.rowCount > 0;
  }
}

async function initializeDatabase() {
  console.log('Attempting to connect to Supabase PostgreSQL...');

  try {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not configured');
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 5000
    });

    await pool.query('SELECT 1');
    await ensurePostgresSchema(pool);
    dbAdapter = new PostgresAdapter(pool);
    console.log('Connected to Supabase PostgreSQL successfully.');
  } catch (error) {
    console.warn('Supabase PostgreSQL connection failed:', error.message);
    console.warn('Falling back to local file storage: schedules.json');
    dbAdapter = JSONAdapter;
  }
}

async function ensurePostgresSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      schedule_datetime TIMESTAMP NOT NULL,
      hourly_reminder BOOLEAN DEFAULT false,
      priority VARCHAR(20) DEFAULT 'medium',
      ringtone VARCHAR(30) DEFAULT 'default',
      is_completed BOOLEAN DEFAULT false,
      last_reminded_at TIMESTAMPTZ NULL DEFAULT NULL,
      reminder_count INTEGER DEFAULT 0,
      completed_at TIMESTAMPTZ NULL DEFAULT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query('ALTER TABLE schedules ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0');
  await pool.query('ALTER TABLE schedules ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ NULL DEFAULT NULL');

  await pool.query('CREATE INDEX IF NOT EXISTS schedules_schedule_datetime_idx ON schedules (schedule_datetime)');
  await pool.query('CREATE INDEX IF NOT EXISTS schedules_is_completed_idx ON schedules (is_completed)');
}

initializeDatabase().then(() => {
  console.log(`Database adapter in use: ${dbAdapter.name}`);

  app.get('/api/status', (req, res) => {
    res.json({
      ok: true,
      storage: dbAdapter.name,
      pwa: true
    });
  });

  app.get('/api/schedules', async (req, res) => {
    try {
      const schedules = await dbAdapter.getSchedules();
      res.json(schedules);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve schedules' });
    }
  });

  app.post('/api/schedules', async (req, res) => {
    const { title, description, schedule_datetime, hourly_reminder, priority, ringtone } = req.body;

    if (!title || !schedule_datetime) {
      return res.status(400).json({ error: 'Title and Schedule Date/Time are required' });
    }

    try {
      const newSchedule = await dbAdapter.addSchedule({
        title,
        description,
        schedule_datetime,
        hourly_reminder,
        priority,
        ringtone
      });
      res.status(201).json(newSchedule);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to create schedule' });
    }
  });

  app.put('/api/schedules/:id/complete', async (req, res) => {
    try {
      const success = await dbAdapter.completeSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      res.json({ message: 'Schedule marked as completed' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  app.put('/api/schedules/:id/reminded', async (req, res) => {
    const { datetime } = req.body;

    if (!datetime) {
      return res.status(400).json({ error: 'Datetime is required' });
    }

    try {
      const success = await dbAdapter.updateRemindedTime(req.params.id, datetime);
      if (!success) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      res.json({ message: 'Last reminded timestamp updated' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update reminder timestamp' });
    }
  });

  app.delete('/api/schedules/:id', async (req, res) => {
    try {
      const success = await dbAdapter.deleteSchedule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Schedule not found' });
      }
      res.json({ message: 'Schedule deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
