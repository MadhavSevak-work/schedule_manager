const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DB Adapter Interface implementation
let dbAdapter = null;
const JSON_FILE_PATH = path.join(__dirname, 'schedules.json');

// Helper to initialize JSON file database
function initJsonFile() {
  if (!fs.existsSync(JSON_FILE_PATH)) {
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify([], null, 2));
  }
}

// JSON Adapter
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
      created_at: new Date().toISOString()
    };
    schedules.push(newSchedule);
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
    return newSchedule;
  },
  async completeSchedule(id) {
    initJsonFile();
    const schedules = await this.getSchedules();
    const index = schedules.findIndex(s => s.id === parseInt(id));
    if (index !== -1) {
      schedules[index].is_completed = true;
      fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
      return true;
    }
    return false;
  },
  async updateRemindedTime(id, datetime) {
    initJsonFile();
    const schedules = await this.getSchedules();
    const index = schedules.findIndex(s => s.id === parseInt(id));
    if (index !== -1) {
      schedules[index].last_reminded_at = datetime;
      fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
      return true;
    }
    return false;
  },
  async deleteSchedule(id) {
    initJsonFile();
    let schedules = await this.getSchedules();
    const initialLength = schedules.length;
    schedules = schedules.filter(s => s.id !== parseInt(id));
    if (schedules.length < initialLength) {
      fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(schedules, null, 2));
      return true;
    }
    return false;
  }
};

// MySQL Adapter
class MySQLAdapter {
  constructor(pool) {
    this.pool = pool;
    this.name = 'MySQL Database';
  }

  async getSchedules() {
    const [rows] = await this.pool.query('SELECT * FROM schedules ORDER BY schedule_datetime ASC');
    return rows.map(row => ({
      ...row,
      hourly_reminder: !!row.hourly_reminder,
      is_completed: !!row.is_completed
    }));
  }

  async addSchedule({ title, description, schedule_datetime, hourly_reminder, priority, ringtone }) {
    const query = `
      INSERT INTO schedules (title, description, schedule_datetime, hourly_reminder, priority, ringtone)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [result] = await this.pool.query(query, [
      title,
      description || null,
      schedule_datetime,
      hourly_reminder ? 1 : 0,
      priority || 'medium',
      ringtone || 'default'
    ]);
    return {
      id: result.insertId,
      title,
      description,
      schedule_datetime,
      hourly_reminder,
      priority,
      ringtone,
      is_completed: false,
      last_reminded_at: null
    };
  }

  async completeSchedule(id) {
    const [result] = await this.pool.query('UPDATE schedules SET is_completed = 1 WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }

  async updateRemindedTime(id, datetime) {
    const [result] = await this.pool.query('UPDATE schedules SET last_reminded_at = ? WHERE id = ?', [datetime, id]);
    return result.affectedRows > 0;
  }

  async deleteSchedule(id) {
    const [result] = await this.pool.query('DELETE FROM schedules WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

// Initialize Database Connection
async function initializeDatabase() {
  console.log('🔄 Attempting to connect to MySQL database...');
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'schedule_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000
    });

    const conn = await pool.getConnection();
    console.log('✅ Connected to MySQL successfully!');
    conn.release();

    // Verify/Create table with updated columns
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`schedules\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`title\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`schedule_datetime\` DATETIME NOT NULL,
        \`hourly_reminder\` BOOLEAN DEFAULT FALSE,
        \`priority\` VARCHAR(20) DEFAULT 'medium',
        \`ringtone\` VARCHAR(30) DEFAULT 'default',
        \`is_completed\` BOOLEAN DEFAULT FALSE,
        \`last_reminded_at\` DATETIME NULL DEFAULT NULL,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Gracefully handle alterations in case database already existed without new columns
    try {
      await pool.query('ALTER TABLE `schedules` ADD COLUMN `priority` VARCHAR(20) DEFAULT "medium"');
      console.log('➕ Added "priority" column to existing schedules table.');
    } catch (e) { /* Column already exists */ }

    try {
      await pool.query('ALTER TABLE `schedules` ADD COLUMN `ringtone` VARCHAR(30) DEFAULT "default"');
      console.log('➕ Added "ringtone" column to existing schedules table.');
    } catch (e) { /* Column already exists */ }

    console.log('📋 Verified "schedules" table structure in MySQL.');
    dbAdapter = new MySQLAdapter(pool);
  } catch (error) {
    console.warn('⚠️  MySQL Connection Failed:', error.message);
    console.warn('💡 Falling back to local file storage: schedules.json');
    dbAdapter = JSONAdapter;
  }
}

// Start database check and then launch express server
initializeDatabase().then(() => {
  console.log(`🔌 Database adapter in use: ${dbAdapter.name}`);

  app.get('/api/status', (req, res) => {
    res.json({
      ok: true,
      storage: dbAdapter.name,
      pwa: true
    });
  });
  
  // Get all schedules
  app.get('/api/schedules', async (req, res) => {
    try {
      const schedules = await dbAdapter.getSchedules();
      res.json(schedules);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to retrieve schedules' });
    }
  });

  // Create a new schedule
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

  // Mark a schedule as completed
  app.put('/api/schedules/:id/complete', async (req, res) => {
    const { id } = req.params;
    try {
      const success = await dbAdapter.completeSchedule(id);
      if (success) {
        res.json({ message: 'Schedule marked as completed' });
      } else {
        res.status(404).json({ error: 'Schedule not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update schedule' });
    }
  });

  // Update last reminded time
  app.put('/api/schedules/:id/reminded', async (req, res) => {
    const { id } = req.params;
    const { datetime } = req.body;
    
    if (!datetime) {
      return res.status(400).json({ error: 'Datetime is required' });
    }

    try {
      const success = await dbAdapter.updateRemindedTime(id, datetime);
      if (success) {
        res.json({ message: 'Last reminded timestamp updated' });
      } else {
        res.status(404).json({ error: 'Schedule not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update reminder timestamp' });
    }
  });

  // Delete a schedule
  app.delete('/api/schedules/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const success = await dbAdapter.deleteSchedule(id);
      if (success) {
        res.json({ message: 'Schedule deleted' });
      } else {
        res.status(404).json({ error: 'Schedule not found' });
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  });

  // Serve static files SPA route fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
