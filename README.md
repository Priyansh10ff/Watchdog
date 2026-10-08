# Watchdog

Uptime and incident monitoring for websites and APIs, built with the MERN stack.

## Problem Statement

Website owners and small teams usually learn that their site is down from angry users, not from their own tools. Existing monitors are either paid, or noisy: one dropped request triggers an alert, and a long outage triggers a flood of repeat alerts.

## Target Users

Developers and small teams who run websites or APIs and want to know quickly and reliably when something stops answering.

## Solution

Watchdog checks each monitored URL on a schedule the user sets. A status machine waits for several failed checks in a row before declaring a site down, so a single dropped request never raises an alarm. When a site goes down, one incident is opened and tracked with its cause and duration. When the site answers again, the incident is resolved automatically.

## Key Features

Implemented:
- Accounts with register, login and logout. The session is a JWT in an httpOnly cookie. Passwords are hashed with bcrypt.
- Monitor management: add, list, edit, pause, resume and delete monitors. Each monitor has its own interval (1 to 60 minutes), timeout, expected status codes, optional keyword check and failure threshold.
- Scheduled checks every minute. Due monitors are claimed atomically, so restarts and multiple instances never double-check a monitor.
- Smart checking: redirects are handled, a keyword can be required in the page, login-protected sites can count 401 or 403 as up, and failed monitors are re-checked within a minute.
- Status machine with a failure threshold, and automatic recovery detection.
- Incidents: opened on the first confirmed outage, updated while it lasts, resolved on recovery with the total duration. Incidents can be acknowledged.
- Check history with automatic 30 day retention, and a results endpoint with 24 hour uptime and average response time.
- SSRF protection: in production the checker refuses private, loopback and link-local addresses, including through DNS and redirects.
- Dashboard with live status that refreshes every 30 seconds, an open-incident banner and an incidents page.

In progress:
- Public status page.
- Charts, SSL certificate expiry warnings and encrypted custom headers for authenticated checks.

## Tech Stack

- Frontend: React, Vite, React Router, Tailwind CSS v4, Axios, React Context
- Backend: Node.js, Express 5, MongoDB with Mongoose, node-cron, Axios
- Security: JWT in an httpOnly cookie, bcrypt, helmet, express-rate-limit, CORS with credentials, input validation, SSRF protection

## Architecture

```
Browser (React)  --- JWT cookie --->  Express API  --->  MongoDB
                                         |
                                  node-cron, every minute
                                         |  claims due monitors (atomic lease)
                                         v
                              checker.service  ->  CheckResult
                                         v
                              incident.service ->  status machine + Incident
```

More detail is in [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md) and [docs/database-schema.md](docs/database-schema.md).

## Local Setup

Requirements: Node.js 20 or newer and a MongoDB database (a free MongoDB Atlas cluster works).

### Backend

```bash
cd server
npm install
cp .env.example .env
npx nodemon
```

Fill `server/.env` first. On Windows PowerShell use `copy .env.example .env`.

### Frontend

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

The app runs at http://localhost:5173 and the API at http://localhost:5000.

### Demo target

A small site you can switch up, slow or down to see Watchdog react:

```bash
cd demo-target
npm install
npm start
```

Open http://localhost:4000, add a monitor for `http://localhost:4000/health`, then use the links on that page to break and restore it.

## Environment Variables

Server (`server/.env`):

```text
PORT
NODE_ENV
MONGO_URI
JWT_SECRET
JWT_EXPIRES_IN
CLIENT_URL
DISABLE_SCHEDULER
```

Client (`client/.env`):

```text
VITE_API_URL
```

Never commit real secrets. `.env` files are ignored by Git.

## Deployment

Not deployed yet. The backend needs a host that stays awake, because the scheduler runs inside the API process.

## Testing

Test cases for every endpoint, with expected results, are listed in [docs/TESTING.md](docs/TESTING.md).

## Author

Priyansh
