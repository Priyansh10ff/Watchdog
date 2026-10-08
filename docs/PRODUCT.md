# Watchdog

Know when your site goes down before your users do. Watchdog checks your websites and APIs on a schedule, confirms real outages without false alarms, and keeps a clear record of every incident.

Requirements in [PRD.md](./PRD.md) · Implementation in [TECHNICAL.md](./TECHNICAL.md) · Interface in [DESIGN.md](./DESIGN.md)

---

## What it is

Watchdog is an uptime and incident tracker. You add the address of a website or API, choose how often it should be checked, and Watchdog does the rest. It requests the address on schedule, measures how fast it answers, and decides whether it is up. When a site stops answering, Watchdog opens one incident with the cause and start time. When the site answers again, the incident closes by itself with its total duration.

## Why it exists

- **Owners usually hear about outages from their users.** By then the damage is done. A monitor that checks every minute finds out first.
- **Simple monitors are noisy.** One dropped request or a brief network blip raises an alarm, and a long outage keeps raising it. Watchdog waits for several failed checks in a row before declaring a site down, and it opens a single incident for the whole outage.
- **Real sites are not always plain 200 pages.** A login-protected site answers 401 or 403 and is still alive. A page can answer 200 and show an error. Watchdog lets you choose which status codes count as up and can require a keyword in the page.
- **An outage needs a record.** Teams want to know when it started, what the error was, how long it lasted and how many checks failed. Incidents keep that history.

## Who it is for

**Primary: developers and freelancers**
People who run their own sites or client sites and want to know quickly when one stops responding, without paying for a monitoring service.

**Secondary: small teams with an API**
Backend developers who need to watch a health endpoint, including endpoints that sit behind authentication and answer with 401 or 403.

**Also: students and project owners**
People with a deployed project or demo who want proof that it stays up.

**Who it is not for**
Large operations that need on-call rotation, SMS or phone alerts, or monitoring of non-HTTP services.

## How it works

1. **Sign up and log in.** The session is kept in a secure cookie.
2. **Add a monitor.** Give it a name and a URL. Optionally set the check interval (1 to 60 minutes), timeout, the status codes that count as up, a keyword the page must contain, and how many failed checks in a row confirm an outage.
3. **Watchdog checks it.** A scheduler runs every minute and checks every monitor that is due. A new monitor is checked immediately.
4. **Status is decided carefully.** One failed check is not an outage. After the set number of failures in a row, the monitor becomes down.
5. **An incident opens.** It records the first failing check, the cause and how many checks failed, and updates while the outage lasts.
6. **Recovery is automatic.** The first successful check closes the incident with its duration.
7. **You stay informed.** The dashboard refreshes by itself, shows an open-incident banner, and the incidents page lists everything with filters. You can acknowledge an incident to show someone is on it.

## Core features

**Accounts**
- Register, log in and log out with a session that survives page refresh
- Passwords hashed with bcrypt, session in an httpOnly cookie

**Monitors**
- Add, edit, pause, resume and delete monitors (up to 20 per user)
- Per-monitor interval, timeout, expected status codes, optional keyword and failure threshold
- Check now on demand

**Checking**
- Scheduled checks every minute with safe claiming, so a restart never double-checks a monitor
- Redirects handled, keyword check, readable failure reasons such as "Timed out after 5000 ms" or "Connection refused"
- Fast re-checks after a failure, so outages are confirmed and recoveries noticed quickly
- Response time and 24 hour uptime statistics, with check history kept for 30 days

**Incidents**
- Opened on the first confirmed outage, once per outage
- Updated while it lasts, resolved automatically on recovery with the duration
- Acknowledge, list with filters and pagination, and detail view with the checks recorded during the incident

**Status page**
- A public page you choose monitors for and share by link, showing live status, uptime, recent checks and past incidents
- Names and status only: URLs and error details are never shown
- The landing page can show a live ticker of popular websites, built from the same public page

**Safety**
- In production the checker refuses private and internal addresses, so a monitor cannot be pointed at the host's own network

## Principles

- **No false alarms.** A single failure never raises an incident.
- **One incident per outage.** No repeated noise while a site is down.
- **Say what happened.** Failures are described in plain words, with the status code and the reason.
- **Your data is yours.** Every monitor and incident belongs to one user and is invisible to everyone else.
- **Safe by default.** Secrets stay in the environment, input is validated, and the checker cannot reach internal networks in production.

## Out of scope

- Email, SMS, push or chat notifications (not part of this version; incidents are shown in the dashboard and on the status page)
- Teams, roles or shared workspaces
- Monitoring of non-HTTP services such as ping or raw TCP ports
- Logging in to a site with a headless browser to check pages behind a login form
- Custom domains for status pages

## Tech at a glance

| Layer | Choice |
|---|---|
| Frontend | React, Vite, React Router, Tailwind CSS v4, Axios |
| Backend | Node.js, Express 5, node-cron, Axios |
| Database | MongoDB with Mongoose |
| Auth | JWT in an httpOnly cookie, bcrypt |
| Hosting plan | Vercel (client), Render (server), MongoDB Atlas (database) |

Requirements and the roadmap are in [PRD.md](./PRD.md). Technical details are in [TECHNICAL.md](./TECHNICAL.md).
