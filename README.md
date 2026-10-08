# Watchdog

**Know when your site goes down before your users do.**

Watchdog is an uptime and incident tracker for websites and APIs. It checks your URLs on a schedule, waits for several failures in a row before calling a site down, opens one incident per outage and closes it automatically when the site recovers.

![Stack](https://img.shields.io/badge/stack-MERN-1f2937) ![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-1f2937) ![Status](https://img.shields.io/badge/status-in%20development-ff9918)

## Contents

- [Why Watchdog](#why-watchdog)
- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration](#configuration)
- [Landing page ticker setup](#landing-page-ticker-setup)
- [Scripts](#scripts)
- [API overview](#api-overview)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Documentation](#documentation)
- [Author](#author)

## Why Watchdog

**Problem.** People who run websites and APIs usually learn about an outage from their users. Simple monitors are noisy: one dropped request raises an alarm and a long outage keeps raising it. Real sites also do not always answer 200. A login-protected API answers 401 and is still alive, and a page can answer 200 and show an error.

**Who it is for.** Developers, freelancers and small teams who want to know quickly and reliably when something stops answering.

**Solution.** Each monitor has its own interval, timeout, expected status codes, optional keyword and failure threshold. A status machine only declares a site down after the threshold of failures in a row. One incident is opened for the whole outage, with its cause and start time, and it resolves itself on recovery with the total duration.

## Features

**Implemented**
- Register, login and logout. The session is a JWT in an httpOnly cookie and survives a refresh. Passwords are hashed with bcrypt.
- Add, edit, pause, resume and delete monitors (up to 20 per user), and check on demand.
- Monitor cards show the response time, 24 hour uptime and a bar for each of the last 24 checks.
- Set the check interval with a rotary dial, a preset or any whole number of minutes from 1 to 60.
- Per-monitor interval (1 to 60 minutes), timeout, expected status codes, optional keyword and failure threshold.
- Scheduled checks every minute. Due monitors are claimed atomically, so a restart or a second instance never double-checks a monitor.
- Redirects handled, keyword check, readable failure reasons such as "Timed out after 5000 ms" or "Connection refused".
- Fast re-checks after a failure, so outages are confirmed and recoveries noticed within a minute.
- Incidents opened on the first confirmed outage, updated while it lasts, resolved automatically with the duration. They can be acknowledged, listed with filters and paginated, and opened in detail.
- Check history for 30 days, with response time and 24 hour uptime statistics.
- Dashboard with live status that refreshes every 30 seconds, an open-incident banner and an incidents page.
- Sentry, a watchdog mascot whose mood shows the status (napping, listening, barking), and an animated landing page with a scroll-driven story.
- A landing page with a live ticker of popular websites that slides through five sites at a time, built from real checks on a showcase status page.
- A public status page you can share: choose monitors, get a link, and visitors see live status, uptime, recent checks and past incidents without logging in. URLs and error details are never shown.
- Protection against server-side request forgery: in production the checker refuses private, loopback and link-local addresses.

**Planned**
- SSL certificate expiry warnings, encrypted custom headers for authenticated checks, maintenance windows and a second-region checker

## How it works

1. A scheduler runs every minute and claims every monitor that is due.
2. Each claimed monitor is checked: the URL is requested, the response time is measured and the result is judged against the monitor's rules.
3. The result is stored and the monitor's status is updated. A failed check increments a counter, and the monitor becomes down only when the counter reaches the failure threshold. One success resets it.
4. When a monitor becomes down, an incident opens. While it stays down the incident is updated. When it answers again the incident resolves.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, Vite, React Router, Tailwind CSS v4, Axios, GSAP |
| Backend | Node.js, Express 5, node-cron, Axios |
| Database | MongoDB with Mongoose |
| Auth | JWT in an httpOnly cookie, bcrypt |
| Hardening | helmet, express-rate-limit, CORS with credentials |
| Hosting plan | Vercel (client), Render (API), MongoDB Atlas (database) |

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

The API and the scheduler run in one process. More in [docs/TECHNICAL.md](docs/TECHNICAL.md).

## Project structure

```
Watchdog/
├── client/        React app (pages, components, context, services)
├── server/        Express API (controllers, models, routes, services, jobs, utils)
├── demo-target/   Small site you can switch up, slow or down for demos
└── docs/          Product, requirements, technical, design, API and deployment docs
```

## Getting started

**Requirements:** Node.js 20 or newer, and a MongoDB database (a free Atlas cluster works).

```bash
git clone https://github.com/Priyansh10ff/Watchdog.git
cd Watchdog
```

**1. API**

```bash
cd server
npm install
cp .env.example .env
```

Fill in `MONGO_URI` and `JWT_SECRET` in `server/.env` (see [Configuration](#configuration)), then:

```bash
npm run dev
```

The API starts on http://localhost:5000. You should see `DB Connected`, `Server started on port 5000` and `Scheduler started`.

**2. Client**

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

The app runs on http://localhost:5173.

**3. Demo target (optional)**

```bash
cd demo-target
npm install
npm start
```

Open http://localhost:4000, add a monitor for `http://localhost:4000/health`, then use the links on that page to make it slow or down and watch Watchdog react.

On Windows PowerShell use `copy .env.example .env` instead of `cp`. If your network blocks MongoDB SRV lookups, use the non-SRV connection string from Atlas.

## Configuration

Server (`server/.env`):

| Variable | Required | Default | Description |
|---|---|---|---|
| `MONGO_URI` | yes | | MongoDB connection string |
| `JWT_SECRET` | yes | | Secret for session tokens. Use a long random value |
| `JWT_EXPIRES_IN` | no | `7d` | Session length |
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | | `production` enables secure cookies, trust proxy and private-address blocking |
| `CLIENT_URL` | no | `http://localhost:5173` | Allowed browser origin, no trailing slash |
| `DISABLE_SCHEDULER` | no | `false` | `true` runs the API without the scheduler |
| `API_RATE_LIMIT` | no | `600` | Requests per IP every 15 minutes across the API, except the health check |
| `TRUST_PROXY` | no | `1` | Proxy hops in front of the API in production, for rate limiting. Use `2` behind the Vercel proxy option |

Client (`client/.env`):

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | API base URL |
| `VITE_SHOWCASE_SLUG` | `world` | Link name of the status page used for the landing page ticker |
| `VITE_FAVICON_URL` | Google's favicon service | Icon service for the ticker, with `{domain}` where the host name goes |

Generate a secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Never commit real secrets. `.env` files are ignored by Git.

## Landing page ticker setup

The landing page shows a ticker of popular websites when a status page called `world` exists with at least 5 monitors. Without that page the section is not shown. One command creates everything:

```bash
cd server
node scripts/seedShowcase.js
```

It creates a showcase account (`showcase@watchdog.local`), adds a monitor for each of 12 popular sites with a 5 minute interval, and publishes them as the status page `world` with site domains switched on, so every row shows the site's own icon and domain. If you ran the script before icons were added, run it again to turn domains on. It is safe to run again: nothing is duplicated, and monitors you have edited keep their settings. Keep the server running, because its scheduler runs the first checks within a minute.

To check it, open `http://localhost:5000/api/status/world`. JSON with the sites means it works, and then reloading the landing page shows the ticker (the answer is cached for 30 seconds). A "Status page not found" message means the script has not run against this database.

Options, as environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `SHOWCASE_EMAIL` | `showcase@watchdog.local` | Account that owns the monitors. Using your own account replaces that account's status page, because each account has one |
| `SHOWCASE_PASSWORD` | random | Password for a new showcase account, 8 to 72 characters. Set it before the first run if you want to log in and edit the monitors. It is ignored if the account already exists |
| `SHOWCASE_SLUG` | `world` | Link name of the page. Set `VITE_SHOWCASE_SLUG` in the client to match |
| `SHOWCASE_TITLE` | `Popular websites` | Title of the page |

For the live site, run the same script against the production database. In PowerShell:

```powershell
$env:MONGO_URI = "your Atlas connection string"
node scripts/seedShowcase.js
```

The icons are loaded by each visitor's browser from Google's favicon service (set `VITE_FAVICON_URL` to use another one), and a row falls back to a letter tile if its icon does not load.

The sites are Google, YouTube, Wikipedia, GitHub, Cloudflare, Amazon, Reddit, Netflix, LinkedIn, Stack Overflow, Microsoft and Spotify. Reddit, LinkedIn and Stack Overflow also accept the codes they use to block automated checks (403, 429 and 999). Some sites may still block your server, so watch the results for a day, log in to the showcase account to adjust a monitor's status codes, or leave a site out. A site that shows down only because it blocks the checker would look like an outage on your public landing page.

## Scripts

| Where | Command | What it does |
|---|---|---|
| `server` | `npm run dev` | Start the API with nodemon |
| `server` | `npm start` | Start the API |
| `server` | `npm test` | Run the server tests |
| `client` | `npm run dev` | Start the Vite dev server |
| `client` | `npm test` | Run the client tests |
| `client` | `npm run build` | Production build into `dist` |
| `client` | `npm run preview` | Serve the production build locally |
| `demo-target` | `npm start` | Start the demo site |

## API overview

All routes are under `/api`. Everything except health, register and login needs the session cookie.

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Monitors | `POST /monitors`, `GET /monitors` (with recent checks and uptime), `GET /monitors/:id`, `PATCH /monitors/:id`, `PATCH /monitors/:id/toggle`, `DELETE /monitors/:id` |
| Checks | `GET /monitors/:id/results`, `POST /monitors/:id/check` |
| Status page | `GET /status/:slug` (public), `GET`, `PUT`, `DELETE /status-page` |
| Incidents | `GET /incidents`, `GET /incidents/:id`, `PATCH /incidents/:id/acknowledge`, `GET /monitors/:id/incidents` |
| Health | `GET /health` |

Bodies, filters and error codes are in [docs/api.md](docs/api.md).

## Testing

```bash
cd server && npm test
cd client && npm test
```

427 server tests and 57 client tests, using Node's built-in test runner, so there is nothing extra to install. The server tests need no database or internet. A GitHub Actions workflow runs both suites and the client build on every push. `docs/TESTING.md` lists what is covered and also holds the manual test cases for the React components and the real database.

## Deployment

The plan is MongoDB Atlas for the database, Render for the API and Vercel for the client. Step-by-step instructions, the production settings and a troubleshooting table are in [docs/deployment.md](docs/deployment.md). Three things matter in production:

- The scheduler runs inside the API process, so the API instance must stay awake.
- `NODE_ENV=production` turns on secure cookies, trust proxy and private-address blocking, and `CLIENT_URL` must match the client origin exactly.
- When the client and API are on different domains, proxy `/api` through the client host so the session cookie stays first-party.

Live app: not deployed yet.

## Security

- Passwords are hashed with bcrypt and never returned by the API.
- The session is an httpOnly cookie, `secure` and `sameSite: none` in production.
- Request types are validated, which blocks NoSQL injection. Every monitor and incident query is scoped to the logged-in user.
- Rate limits per IP: 600 requests per 15 minutes across the API, 10 per 15 minutes on register and login, and 60 per minute on the public status page. Monitors are limited to 20 per user.
- helmet headers, CORS restricted to `CLIENT_URL`, 10 kB body limit.
- In production the checker blocks private, loopback and link-local addresses at DNS lookup time, for IP-literal URLs and for redirect targets.
- Secrets live only in environment variables.

## Limitations and roadmap

- One scheduler process. Atomic claiming already makes extra instances safe.
- HTTP and HTTPS only, GET and HEAD only.
- No outbound notifications (email, SMS, chat). Incidents are shown in the dashboard and on the status page.

Next: deployment, then the optional extras. Then SSL expiry warnings, encrypted custom headers, maintenance windows and a second-region checker. The full plan is in [docs/PRD.md](docs/PRD.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/PRODUCT.md](docs/PRODUCT.md) | What Watchdog is, why it exists, who it is for |
| [docs/PRD.md](docs/PRD.md) | Requirements, user stories, acceptance criteria, release plan, risks |
| [docs/TECHNICAL.md](docs/TECHNICAL.md) | Architecture, check pipeline, status machine, security, configuration |
| [docs/DESIGN.md](docs/DESIGN.md) | Design system as built and the planned redesign |
| [docs/api.md](docs/api.md) | API reference |
| [docs/database-schema.md](docs/database-schema.md) | Collections and indexes |
| [docs/deployment.md](docs/deployment.md) | Hosting guide and troubleshooting |
| [docs/TESTING.md](docs/TESTING.md) | Test cases with expected results |
| [docs/CHECKLIST.md](docs/CHECKLIST.md) | Submission and production readiness checklist |

## Author

Built by [Priyansh](https://github.com/Priyansh10ff).
