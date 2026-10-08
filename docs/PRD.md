# Watchdog: Product Requirements Document

| | |
|---|---|
| **Product** | Watchdog uptime and incident tracker |
| **Owner** | Priyansh |
| **Status** | v1.0 in development |
| **Live** | Not deployed yet. See [deployment.md](./deployment.md) |
| **Last updated** | October 2026 |

Related: [PRODUCT.md](./PRODUCT.md) (overview) · [TECHNICAL.md](./TECHNICAL.md) (implementation) · [DESIGN.md](./DESIGN.md) (interface) · [CHECKLIST.md](./CHECKLIST.md) (readiness)

---

## 1. Problem

People who run websites and APIs usually find out about an outage from their users. Hosted monitoring services exist, but the free ones are limited and the simple ones are noisy: a single dropped request raises an alarm, and a long outage keeps raising it.

Real sites also do not behave like a plain page that always answers 200. A login-protected site answers 401 or 403 and is still alive. A page can answer 200 and show an error. Some sites redirect. A monitor that cannot handle this gives false alarms or misses real failures.

Watchdog checks each address on a schedule, waits for several failures in a row before calling a site down, opens one incident per outage, and closes it automatically on recovery.

## 2. Goals

| # | Goal | How we know |
|---|---|---|
| G1 | A new user has a monitor running within 2 minutes of signing up | Timed walkthrough: sign up, add monitor, first check result appears |
| G2 | A single failed check never raises an incident | Status machine tests: failures below the threshold keep the monitor up |
| G3 | One outage produces exactly one incident, with the right start time and cause | Incident tests, including the race where two checks try to open it at once |
| G4 | A check never runs twice for the same monitor, even after a restart or with two server instances | Atomic claiming tests |
| G5 | A monitor cannot be used to reach the host's internal network | Private-address tests in production mode |
| G6 | The whole product runs at zero hosting cost to start | Vercel Hobby, Render free, Atlas M0 |

## 3. Non-goals

- Email, SMS, push or chat notifications
- Teams, roles or shared workspaces
- Monitoring of non-HTTP services (ping, TCP ports)
- Logging in to a site with a headless browser
- Custom domains for status pages
- Native mobile apps (the web app is responsive)

## 4. Users

| Persona | Description | Main needs |
|---|---|---|
| **Riya, freelance developer** | Hosts three client sites. No budget for a monitoring service | Add sites in seconds, know quickly when one is down, show clients a record |
| **Arjun, backend developer at a startup** | Owns an API whose health endpoint is behind auth | Count 401 and 403 as alive, avoid false alarms from one dropped request |
| **Meera, student** | Has a deployed project for her portfolio and college demo | A dashboard and history that prove the project stays up |

## 5. User stories and acceptance criteria

### Accounts

**A1. As a new user, I can sign up and start straight away.**
- Name, email and password (8 to 72 characters) are required.
- The email is trimmed and lowercased. Registering an email that already exists returns "Email already exists".
- Input that is not a string is rejected with "Invalid input".
- On success I am logged in and land on the dashboard.

**A2. As a user, I can log in and log out.**
- A wrong email or password shows one generic message, "Invalid email or password".
- The session lasts 7 days and survives a page refresh.
- Logging out clears the session.

**A3. As a user, I only see pages I am allowed to see.** Protected pages send me to login. Login and signup send a logged-in user to the dashboard. The landing page stays open to everyone: a logged-in user sees a profile chip with their initial and name in place of Log in, and the chip opens the dashboard.

### Monitors

**M1. As a user, I can add a monitor.**
- Name (1 to 60 characters) and URL (http or https, no credentials in the URL) are required.
- Optional: method GET or HEAD, interval 1 to 60 minutes, timeout 1 to 30 seconds, 1 to 20 expected status codes between 100 and 599, a keyword of up to 100 characters (needs GET), and a failure threshold of 1 to 10.
- Adding the same URL twice returns "You are already monitoring this URL". More than 20 monitors is refused.
- A new monitor is checked immediately.

**M2. As a user, I can change a monitor's settings** from an Edit page opened from its card (name, method, interval, timeout, status codes, keyword, threshold). The URL cannot change. Saving sends only the fields that changed, and saving with no changes sends nothing. Changing the interval schedules the next check right away.

**M2a. As a user, I can set the schedule with a dial.** The interval is set with a rotary dial, preset chips (1, 2, 5, 10, 15, 30 minutes, 1 hour) or a custom whole number of minutes from 1 to 60, both when adding and when editing a monitor. The dial can be dragged or used with the arrow keys.

**M3. As a user, I can pause and resume a monitor.** A paused monitor is not checked. Resuming checks it immediately.

**M4. As a user, I can delete a monitor.** Its check history and incidents are deleted with it. A dialog inside the page asks first and names the monitor. Cancel is the default choice, Escape or a click outside cancels, and no browser pop-up is used.

**M5. As a user, I can see all my monitors with their status.** Each card shows status, response time, 24 hour uptime, a bar for each of the last 24 checks, the interval and the last check time, with Edit, Pause or Resume and Delete. The dashboard refreshes by itself every 30 seconds and has loading, empty and error states.

**M6. As a user, I can check a monitor on demand.** Paused monitors are refused, and a monitor checked in the last 10 seconds returns "Wait a few seconds before checking again".

### Checking

**C1. As a user, my monitors are checked on the schedule I set.** A scheduler runs every minute and checks every monitor that is due. Each monitor is claimed atomically, so it is never checked twice at the same time.

**C2. As a user, I choose what counts as up.** A check is up when the response status is in my expected list and, if I set a keyword, the page contains it. Redirects are followed (up to 3) when the redirect itself is not in my expected list. A request that exceeds the timeout fails.

**C3. As a user, one failure does not raise an alarm.** The monitor becomes down only after my failure threshold of checks in a row fail. A success resets the count.

**C4. As a user, outages are confirmed quickly.** After a failure, or while down, the next check happens within a minute even if my interval is longer.

**C5. As a user, I can see how a monitor has performed.** The results endpoint returns the latest checks and, for the last 24 hours, the number of checks, uptime percentage and average response time. Check history is deleted automatically after 30 days.

### Incidents

**I1. As a user, an outage creates one incident.** It opens when the monitor becomes down, starts at the first failing check after the last success, and records the cause (status code and message).

**I2. As a user, the incident tracks the outage.** The failed check count and the latest error update while the outage lasts. No second incident is created for the same outage.

**I3. As a user, recovery closes the incident.** The first successful check resolves it and stores the duration.

**I4. As a user, I can acknowledge an open incident.** Acknowledging twice, or acknowledging a resolved incident, is refused with a clear message.

**I5. As a user, I can list incidents.** Filters: active, open, acknowledged, resolved or all, and by monitor. Results are paginated (up to 50 per page).

**I6. As a user, I can open an incident** and see the checks recorded during it.

**I7. As a user, the dashboard shows open incidents** with the monitor name and how long it has been down, and links to the incidents page.

### Safety and privacy

**S1. As the operator, I want monitors to be unable to reach internal networks.** In production, addresses in private, loopback and link-local ranges are refused at DNS lookup, for IP-literal URLs and for redirect targets.

**S2. As a user, my data is private.** Every monitor and incident query is filtered by my account. Another user's resource, or an invalid id, returns 404.

### Public status page

**P1. As a user, I can publish a status page** for monitors I choose and share its link.
- I set a title and a link name (3 to 40 characters: lowercase letters, numbers and hyphens). A taken link returns "That link is already taken".
- I can choose up to 20 of my own monitors, hide the page without deleting it, and delete it.
- Deleting a monitor removes it from the page.

**P2. As a visitor, I can read a status page without logging in.**
- It shows the overall state, and for each monitor its status, 24 hour uptime, response time and a bar for each of the last 30 checks, then incidents from the last 14 days.
- It never shows URLs, error messages or causes. If the owner turns on Show site domains, it also shows each monitor's host name, such as github.com, and nothing more of the address.
- An unknown or hidden page shows "Status page not found".
- It refreshes every minute. The data is cached for up to 30 seconds and limited to 60 requests per minute per IP.

**P3. As a visitor on the landing page, I see how popular websites are doing right now.** A ticker shows five sites at a time and slides to the next one every few seconds, with each site's uptime, response time and recent checks. Each row shows the site's own icon, loaded in the visitor's browser, and falls back to a letter tile if the icon cannot be loaded. It uses real checks from a showcase status page and is hidden when that page does not exist or has fewer than 5 monitors.

## 6. Functional requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR1 | Register, login, logout, session in an httpOnly cookie, bcrypt hashing | Must | Done |
| FR2 | Rate limit on register and login | Must | Done |
| FR3 | Monitor CRUD with validation, duplicate protection and a 20 monitor limit | Must | Done |
| FR4 | Pause, resume and on-demand check | Must | Done |
| FR5 | Scheduler with atomic claiming of due monitors | Must | Done |
| FR6 | Check engine: status codes, keyword, redirects, timeout, readable errors | Must | Done |
| FR7 | Status machine with failure threshold and quick re-check | Must | Done |
| FR8 | Check results, 24 hour statistics, 30 day retention | Must | Done |
| FR9 | Incidents: open, update, resolve, acknowledge | Must | Done |
| FR10 | Incident list, filters, pagination and detail | Must | Done |
| FR11 | Dashboard with live refresh, open-incident banner and incidents page | Must | Done |
| FR12 | SSRF protection in production | Must | Done |
| FR13 | Demo target app for demonstrations | Should | Done |
| FR14 | Public status page | Must | Done |
| FR15 | Response time chart and uptime bar | Should | Open |
| FR16 | SSL certificate expiry warnings | Could | Open |
| FR17 | Encrypted custom headers for authenticated checks | Could | Open |
| FR18 | Maintenance windows | Could | Open |
| FR19 | Second-region checker agent | Could | Open |
| FR20 | Automated tests for the status machine, validators, check engine, incidents, API and hardening | Should | Done |
| FR21 | Rate limit on the rest of the API | Should | Done |
| FR22 | Deployment on Render, Vercel and Atlas | Must | Open |
| FR23 | Sentry mascot UI with animated landing page and scroll story | Could | Done |
| FR24 | Pulse monitor cards: response time, 24 hour uptime, bars for recent checks | Should | Done |
| FR25 | Edit monitor page and interval dial with a custom interval | Should | Done |
| FR26 | Landing page ticker of popular sites, from a showcase status page | Could | Done |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| **Correctness** | The status machine is deterministic. Incident creation is idempotent: a unique partial index allows one unresolved incident per monitor, and a duplicate-key race falls back to the existing incident. A failure inside incident handling never breaks checking. |
| **Security** | bcrypt password hashes never leave the server. Request types are validated, which blocks NoSQL injection. Ownership is checked on every query. CORS accepts only `CLIENT_URL`. `helmet` headers. Body limit 10 kB. Rate limits per IP on the whole API, on login and on the public status page. Invalid input never produces a stack trace. Secrets only in environment variables. In production the checker blocks private addresses. |
| **Privacy** | Monitors, results and incidents are visible only to their owner. Check results are deleted after 30 days. |
| **Reliability** | The server only listens once MongoDB is connected. A claimed monitor is leased for 2 minutes, so a crashed check is retried. The scheduler skips a run while the previous one is still going. One monitor's error never stops the others. |
| **Performance** | Up to 200 due monitors are claimed per run and checked 10 at a time. Responses are limited to 2 MB. List endpoints are paginated. Indexes cover the dashboard, scheduler and incident queries. |
| **Compatibility** | Latest two versions of Chrome, Edge, Firefox and Safari. Layouts work from 360 px wide. |
| **Accessibility** | Text pairs meet WCAG AA, visible focus, labelled form fields, semantic buttons and links, reduced-motion support. Remaining gaps are listed in [DESIGN.md](./DESIGN.md) and tracked in [CHECKLIST.md](./CHECKLIST.md). |
| **Maintainability** | Configuration from environment variables only. Logic lives in services, controllers stay thin. Automated tests (435 server and 57 client) run in CI, and manual test cases for the rest are in [TESTING.md](./TESTING.md). |

## 8. Success metrics

| Metric | Target |
|---|---|
| Time from adding a monitor to its first result | under 1 minute |
| Incidents opened by a single failed check | 0 |
| Outage confirmed after | failure threshold × about 1 minute |
| Incidents per outage | exactly 1 |
| Duplicate checks of one monitor | 0 |
| p95 API latency (excluding host cold start) | under 300 ms |
| Private-address checks that succeed in production | 0 |

## 9. Release plan

| Version | Scope |
|---|---|
| **v1.0 (end-term submission)** | Everything marked Done, plus deployment (FR22), documentation and demo video |
| **v1.1** | Charts (FR15), SSL expiry (FR16), encrypted custom headers (FR17) |
| **v1.2** | Maintenance windows (FR18), second-region checker (FR19) |
| **Later** | Outbound notifications (email, Slack, Discord), teams, status page custom domains |

## 10. Risks and open questions

| Risk | Impact | Mitigation |
|---|---|---|
| Free hosting sleeps | The scheduler lives in the API process, so checks stop while the server is asleep | Always-on instance, or an external ping on `/api/health` at least every 10 minutes |
| Sites that block bots or datacenter IPs | False "down" results | A clear User-Agent, and users can list 403 or 429 as expected status codes |
| Geo-blocked sites | A site looks down from one region | Documented limitation. The second-region agent (FR19) addresses it |
| Cross-site cookies between Vercel and Render | Browsers that block third-party cookies may break login | Proxy `/api` through the client host so cookies are first-party (see [deployment.md](./deployment.md)) |
| Large check history on the free database | Storage fills up | 30 day automatic retention. Estimate: a 1-minute monitor stores about 43,000 results per month |
| Single scheduler process | One process does all checking | Atomic claiming already makes extra instances safe. Scaling out is a later step |
| No outbound notifications | Users must open the app to notice an incident | Out of scope for now. The dashboard and status page show incidents |
| Showcase checks of big sites are blocked by their bot protection | A well-known site looks down on the public landing page | Check the dashboard for a day before publishing, add the code the site returns to its status codes, or leave the site out |
