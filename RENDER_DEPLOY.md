# Deploy Harvest Root on Render

## Required environment variables

In **Render Dashboard → Your Web Service → Environment**, add:

| Key | Example | Notes |
|-----|---------|--------|
| `NODE_ENV` | `production` | Usually set by Render |
| `SESSION_SECRET` | *(random 64-char hex)* | **Required.** Run `openssl rand -hex 32` or use a password generator |
| `EMAIL_USER` | `harvestroot2020@gmail.com` | Gmail that sends OTP codes |
| `EMAIL_PASS` | `xxxx xxxx xxxx xxxx` | Gmail **App Password**, not normal password |
| `EMAIL_SERVICE` | `gmail` | Optional |

Without `SESSION_SECRET`, the app used to **crash on deploy** (exit code 1).

Without `EMAIL_USER` / `EMAIL_PASS`, the site runs but **customers never receive verification emails**.

## Build & start commands

- **Build command:** `npm install`
- **Start command:** `npm start` or `node server.js`

Render sets `PORT` automatically (often `10000`). Do not hardcode port 3000.

## Persistent disk (optional)

Free tier has **no** `/var/data` disk. The app uses `database.sqlite` in the project folder (data resets on redeploy unless you add a Render Disk).

To use a disk:
1. Add a **Persistent Disk** in Render and mount path e.g. `/var/data`
2. Set `DATA_DIR=/var/data`

## After deploy

1. Open `https://your-app.onrender.com/api/health` — should return `"ok": true`
2. Test signup — check spam folder for OTP email
3. Change default admin password: `npm run change-password` locally against production DB if needed

## Common log messages

| Log | Meaning |
|-----|---------|
| `FATAL: Set SESSION_SECRET` | Add `SESSION_SECRET` in Environment (older builds) |
| `SMTP verification failed: Connection timeout` | Gmail blocked from Render IP — app should still start; try App Password or port 587 |
| `Could not write to persistent disk at /var/data` | Normal on free tier without disk — uses local SQLite |
