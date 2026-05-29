# Chronos Schedule Manager

Chronos is a mobile-friendly schedule and alarm manager built with Node.js, Express, MySQL, and a vanilla PWA frontend. It can be installed from the browser on Android and added to the Home Screen on iPhone.

## Features

- Schedule alarms with title, notes, date/time, priority, ringtone, and optional hourly repeats.
- Browser alarm overlay with synthesized sound and Android vibration support while the app is open.
- Desktop/mobile notification permission flow.
- Calendar export for native iPhone/Android reminder handoff.
- Installable Progressive Web App with offline shell caching.
- MySQL storage with automatic fallback to `schedules.json`.

## Important Mobile Notes

Browser apps cannot always run exact alarm audio after the app is fully closed or the phone aggressively sleeps the browser.

- Android: install from Chrome for the best PWA experience. Keep the app open or recently active for in-app alarms. Use calendar export when you need a locked-screen system reminder.
- iPhone/iPad: install with Safari's Add to Home Screen. iOS limits background browser audio, so use the calendar export button for the most reliable native reminder.

## Local Setup

```bash
npm install
npm start
```

Open `http://localhost:3000`.

If MySQL is unavailable, Chronos automatically uses `schedules.json`.

## MySQL Setup

Run `schema.sql` in MySQL, then configure `.env`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=schedule_db
```

Restart the server after changing database settings.

## Browser Installation

### Android Chrome

1. Open the hosted Chronos URL in Chrome.
2. Tap the install banner or Chrome menu.
3. Choose Install app or Add to Home screen.

### iPhone Safari

1. Open the hosted Chronos URL in Safari.
2. Tap Share.
3. Choose Add to Home Screen.
4. Launch Chronos from the new Home Screen icon.

## API

- `GET /api/status` - app health and active storage adapter.
- `GET /api/schedules` - list schedules.
- `POST /api/schedules` - create a schedule.
- `PUT /api/schedules/:id/complete` - mark complete.
- `PUT /api/schedules/:id/reminded` - update last reminder timestamp.
- `DELETE /api/schedules/:id` - delete a schedule.
