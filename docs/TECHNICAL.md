# Watchdog: Technical Documentation

How Watchdog is built and why. For requirements see [PRD.md](./PRD.md), for the product overview see [PRODUCT.md](./PRODUCT.md), for the interface see [DESIGN.md](./DESIGN.md).

Details live in [api.md](./api.md) (endpoints), [database-schema.md](./database-schema.md) (collections), [deployment.md](./deployment.md) (hosting) and [TESTING.md](./TESTING.md) (test cases).

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Client | React 19, Vite, React Router 7, Tailwind CSS v4, Axios, GSAP | State is local to pages plus an auth context. GSAP drives Sentry and the landing page |
| Server | Node.js 20 or newer, Express 5 | ES modules |
| Scheduling | node-cron | Runs inside the API process |
| HTTP checks | Axios with custom agents | Timeout, redirects and DNS control |
| Database | MongoDB with Mongoose | Atlas M0 for hosting |
| Auth | JWT in an httpOnly cookie, bcrypt (cost 10) | |
| Hardening | helmet, express-rate-limit, cors, cookie-parser | |

## 2. Repository layout

```
Watchdog/
├── client/                  React app
│   └── src/
│       ├── pages/           Landing, Login, SignUp, Dashboard, AddMonitor, Incidents
│       ├── components/      Sentry, SentryAvatar, MonitorTile, StatusBadge, IncidentList, Navbar, AuthLayout, route guards
│       ├── context/         AuthContext
│       ├── services/        api.js (Axios instance)
│       └── utils/           monitorState.js, sentryPose.js, time.js
├── server/
│   ├── index.js             App setup, DB connection, scheduler start
│   ├── controllers/         auth, monitor, incident
│   ├── middlewares/         auth (isAuthenticated), rate limit
│   ├── models/              user, monitor, checkResult, incident
│   ├── routes/              auth, monitor, incident
│   ├── services/            checker.service.js, incident.service.js
│   ├── jobs/                scheduler.js
│   └── utils/               generateToken, validateUrl, isPrivateIp, ApiError
├── demo-target/             Small site to switch up, slow or down for demos
└── docs/
```

## 3. Architecture

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

The API and the scheduler share one process. This keeps hosting simple and free. Safe claiming (section 5) means a second instance, or a restart in the middle of a run, cannot cause a duplicate check.

## 4. Request flow

1. The client calls the API with `withCredentials`, so the browser sends the session cookie.
2. `isAuthenticated` verifies the JWT, loads the user (rejecting deleted accounts) and sets `req.user`.
3. Controllers validate input types and ranges, then query MongoDB. Every monitor and incident query includes `user: req.user._id`.
4. Responses are `{ success, message, ... }`. Unexpected errors log on the server and return a generic 500.

## 5. Check pipeline

**Scheduling.** `jobs/scheduler.js` runs `runDueChecks` every minute and once at startup. A `running` flag skips a run while the previous one is still active.

**Claiming.** `claimDueMonitors` repeatedly runs `findOneAndUpdate` on `{ isActive: true, nextCheckAt: <= now }` and sets `nextCheckAt` two minutes ahead in the same atomic operation. The claimed monitor is the caller's to check. If the process dies mid-check, the lease expires and the monitor is checked again after two minutes. Up to 200 monitors are claimed per run and checked 10 at a time. An error in one monitor is caught and logged without affecting the rest.

**Immediate checks.** Creating a monitor or resuming one calls `checkSoon`, which claims that single monitor and checks it right away.

**One check.** `runCheck(monitor)` returns `{ isUp, statusCode, responseTimeMs, errorMessage }` and never throws.
- Request: the monitor's method, a `WatchdogBot` user agent, the monitor's timeout enforced for the whole request with `AbortSignal.timeout`, a 2 MB response limit.
- Up means the status is in the expected list and, when a keyword is set, the body contains it.
- Redirects: the first request does not follow redirects. If its status is not expected but is a redirect with a `Location`, the check repeats following up to 3 redirects and judges the final response. If the first status is expected (for example the user listed 301), that result stands.
- Errors become readable messages: "Timed out after N ms", "Connection refused", "DNS lookup failed", "Connection reset", "TLS error: CODE", "Unexpected status 503", "Keyword not found".

**Storing the result.** `processMonitor` runs the check, calls `applyResult`, saves a `CheckResult`, saves the monitor, then calls `handleIncident`.

## 6. Status machine

`applyResult(monitor, result)` in `services/incident.service.js`:

| Situation | Effect |
|---|---|
| Check fails | `consecutiveFailures` + 1. When it reaches `failureThreshold` and the monitor is not already down, status becomes `down` and the transition is `down` |
| Check succeeds | `consecutiveFailures` resets to 0. If the monitor was `down`, the transition is `recovered`. Status becomes `up` |
| Scheduling | A healthy monitor waits its full interval. After a failure, or while down, the next check is within 1 minute at most |

A monitor that has never succeeded and has failed fewer times than the threshold stays `unknown`, shown as Pending.

## 7. Incidents

`handleIncident(monitor, result, transition)`:

- On `recovered`, `resolveIncident` finds the unresolved incident, marks it resolved and stores `durationMs`.
- On a failure while the monitor is down, `trackFailure` increments `failedChecks` and updates `lastError` on the existing incident. If none exists, it creates one whose `startedAt` and `cause` come from the first failing check after the last successful one.
- A unique partial index (`monitor`, only where `isResolved` is false) guarantees one unresolved incident per monitor. If two writers race, the duplicate-key error is caught and the existing incident is used.
- Any error inside incident handling is logged and swallowed, so a database problem there never stops checking.

Acknowledge is a conditional update (`status: "open"` to `"acknowledged"`), so it cannot run twice.

## 8. Data model

Collections: `users`, `monitors`, `checkresults`, `incidents`. Fields and indexes are listed in [database-schema.md](./database-schema.md). Notable choices:

- Monitor status and last result are stored on the monitor so the dashboard needs one query.
- `checkresults` has a TTL index that deletes documents 30 days after `checkedAt`, so no cleanup job is needed.
- The scheduler query is covered by an `(isActive, nextCheckAt)` index.
- A unique `(user, url)` index prevents duplicate monitors.

## 9. API

Endpoints, bodies and error codes are in [api.md](./api.md). Summary:

| Group | Paths |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| Monitors | `POST /monitors`, `GET /monitors` (with recent checks and 24 hour uptime), `GET/PATCH/DELETE /monitors/:id`, `PATCH /monitors/:id/toggle`, `GET /monitors/:id/results`, `GET /monitors/:id/incidents`, `POST /monitors/:id/check` |
| Incidents | `GET /incidents`, `GET /incidents/:id`, `PATCH /incidents/:id/acknowledge` |
| Status page | `GET /status/:slug` (public), `GET`, `PUT`, `DELETE /status-page` (owner) |
| Health | `GET /health` |

Error codes: 400 invalid input, 401 not logged in or bad credentials, 403 monitor limit, 404 missing or not yours, 409 duplicate, 429 too many requests, 500 unexpected.

## 9a. Public status page

A user owns at most one `StatusPage` (slug, title, chosen monitors, published flag). `GET /api/status/:slug` is public and works like this:

1. A malformed slug returns 404 without touching the database.
2. A cached answer (30 seconds, up to 500 pages) is returned if there is one.
3. Otherwise the page is loaded, its monitors are read in the owner's order, and the shared history service (`services/history.service.js`) adds the last 30 checks and the 24 hour uptime. Incidents of those monitors from the last 14 days are added, up to 10.
4. The overall state is `outage` if any monitor is down, `degraded` if any is slow (over 1.5 seconds), `paused` if all are paused, `empty` with no monitors, otherwise `operational`.
5. The answer is built from an allow-list of fields, so URLs, ids, causes and error messages are never sent. The one optional exception is the host name: when the owner turns on `showDomains`, each monitor carries `domain`, the host without `www`, port, path or query, taken with `new URL`. An address that cannot be parsed gives `null`. It is cached and returned.

Saving or deleting a page clears its cached answer, and so does deleting a monitor that was on it, so changes show immediately. The route is limited to 60 requests per minute per IP. Unknown, malformed and unpublished pages all give the same 404 so a visitor cannot tell a private page from a missing one. The owner endpoints validate the slug with a pattern, check that every chosen monitor belongs to the user and turn a duplicate-key error into a 409.

The `/status/:slug` page in the client polls this endpoint every 60 seconds. The owner manages the page at `/status-page`.

## 10. Security

| Area | Measure |
|---|---|
| Passwords | bcrypt, 8 to 72 characters, never returned by the API |
| Session | JWT in an httpOnly cookie, 7 days. In production the cookie is `secure`. `SameSite` is `none` by default so a separate client domain can use it, and `lax` with `COOKIE_SAMESITE=lax`, which is what the Vercel proxy setup uses: other websites then cannot make the browser send the cookie, which blocks cross-site request forgery on the routes that take no JSON body |
| Input | Types are checked before use, which blocks NoSQL injection through objects. Ranges and lengths are validated. Unknown fields are never copied into documents |
| Authorization | Every monitor and incident query is scoped to the logged-in user. Another user's resource returns 404 |
| Abuse | Three limits per IP: 600 requests per 15 minutes across the API (`API_RATE_LIMIT`), 10 per 15 minutes on register and login, and 60 per minute on the public status page. Monitors limited to 20 per user. Check-now has a 10 second cooldown |
| Transport | CORS allows only `CLIENT_URL` with credentials. `helmet` headers. 10 kB body limit |
| SSRF | In production the checker refuses loopback, private and link-local addresses. The check runs inside a custom DNS lookup, so the address that was validated is the one connected to. IP-literal URLs and redirect targets are checked too. URLs with embedded credentials are rejected |
| Secrets | Only in environment variables. `.env` files are ignored by Git |

The API-wide limiter runs before the body is read, so requests with invalid or oversized bodies count too. CORS preflights and the health check are not counted.

## 11. Configuration

Server (`server/.env`):

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MONGO_URI` | yes | none | MongoDB connection string |
| `JWT_SECRET` | yes | none | Signs session tokens. Use a long random value |
| `JWT_EXPIRES_IN` | no | `7d` | Session length |
| `PORT` | no | `5000` | API port |
| `NODE_ENV` | no | none | `production` enables secure cookies, trust proxy and private-address blocking |
| `CLIENT_URL` | no | `http://localhost:5173` | Allowed browser origin, no trailing slash |
| `DISABLE_SCHEDULER` | no | `false` | Set to `true` to run the API without the scheduler |
| `API_RATE_LIMIT` | no | `600` | Requests allowed per IP every 15 minutes across the whole API, except the health check |
| `COOKIE_SAMESITE` | no | `none` in production, `lax` otherwise | `SameSite` of the session cookie: `lax`, `strict` or `none`. Use `lax` behind the Vercel proxy, where the cookie is first-party. `none` is always sent as secure |
| `TRUST_PROXY` | no | `1` | Number of proxy hops in front of the API in production, used to find the visitor's IP for rate limiting. Use `2` behind the Vercel proxy option |

Client (`client/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | API base URL |
| `VITE_SHOWCASE_SLUG` | `world` | Link name of the status page shown as the landing page ticker |
| `VITE_FAVICON_URL` | Google's favicon service | Address of the icon service for the ticker, with `{domain}` where the host name goes. For example `https://icons.duckduckgo.com/ip3/{domain}.ico` |

The server refuses to start if `MONGO_URI` or `JWT_SECRET` is missing.

## 12. Local development

See the README for the commands. Notes:

- `NODE_ENV` is not `production` locally, so `localhost` targets are allowed. That is how `demo-target` works.
- If your network blocks MongoDB SRV lookups, use the non-SRV connection string from Atlas locally.
- `npx nodemon` restarts the API on file changes. Changing `.env` needs a manual restart (`rs`).

## 12a. Production behaviour

`app.js` builds the Express app and `index.js` connects to the database, starts the server and the scheduler, and handles shutdown. Splitting them lets the tests load the whole app without a database.

Middleware order matters: `helmet`, then CORS (so preflights are answered first), then the health check, then the API-wide rate limiter, then the body and cookie parsers, then the routes, then a JSON 404 and an error handler. The error handler turns an invalid JSON body into a 400, an oversized body into a 413, other client errors such as a malformed path into a 400, and everything else into a generic 500 that never shows internals.

Requests are logged with `morgan` (`combined` format in production, without the health check and in tests).

On `SIGTERM` or `SIGINT`, which Render sends when it redeploys, the server stops the scheduler, stops accepting connections, finishes open requests, closes the database connection and exits. It forces an exit after 10 seconds.

## 13. Testing

Automated tests use Node's built-in test runner: 435 server tests and 57 client tests, run with `npm test` in each folder and in CI on every push. The server tests replace the database models with in-memory stand-ins and test the check engine against a local web server, so they need no database or internet. The full list is in [TESTING.md](./TESTING.md), which also holds the manual cases for the parts the automated tests do not cover (the React components, the animations and the real database).

## 13a. Client animation

- `components/Sentry.jsx` is the animated dog. It is plain DOM with `data-part` attributes. `utils/sentryPose.js` defines three poses (`up`, `slow`, `down`) as values for ears, eyes, brows, mouth, sound waves and z's, and helpers to apply them with GSAP or to add them to a timeline.
- When the `mode` prop changes, `Sentry` tweens to the new pose and starts or stops its barking loops (shake, jaw, waves). Idle loops (breathing, blinking, floating z's) run inside a `gsap.context`, which is reverted on unmount.
- The landing page (`pages/Landing.jsx`) is lazy-loaded so ScrollTrigger is not part of the main bundle. Its scroll story is one scrubbed timeline over a pinned (sticky) stage. It is created only at 1280 px and wider and when reduced motion is off. Below that, or with reduced motion, the story is shown as stacked cards.
- React owns the markup and the colour classes. GSAP owns transforms and the properties it tweens, so React state never writes to the same inline styles.

## 13b. Monitor list history

`GET /monitors` adds two fields to every monitor so the dashboard cards need one request: `recentChecks` (the last 24 check results, oldest first) and `uptime24h`. The controller runs one indexed query per monitor on `(monitor, checkedAt)` for the recent checks and one aggregation over the last 24 hours for all of the user's monitors, so a list call costs at most 20 small queries plus one grouped read. The dashboard polls it every 30 seconds.

The edit page loads `GET /monitors/:id`, compares the form with the saved monitor and sends only the changed fields to `PATCH /monitors/:id`. The `IntervalDial` component maps the interval to the knob angle on a logarithmic scale between 1 and 60 minutes and snaps to a preset when the value is within about 8 percent of it.

## 13c. Landing page ticker

`components/LiveTicker.jsx` fetches `GET /api/status/<slug>` (the `VITE_SHOWCASE_SLUG` page, `world` by default) when the landing page loads and again every 60 seconds. If the request fails, the page does not exist or it has fewer than 5 monitors, the section renders nothing, so the landing page never shows made-up data.

With data, it shows summary chips (sites watched, how many are down or slow, average response time) and a window five rows tall. The rows are the monitors followed by the first five again. A GSAP timeline slides the track up one row every 3.2 seconds (2.5 seconds still, 0.7 seconds moving) and, after the last row, restarts from the identical repeated view, so the loop has no jump. It pauses when the section is off screen and when the pointer is over it. With reduced motion it shows the first five sites without scrolling. The repeated rows are hidden from screen readers. When the page shares domains, each row shows the site's own icon: the browser loads it from a favicon service (Google's by default, or `VITE_FAVICON_URL`) using the host name, encoded, at 64 pixels shown at 32, with no referrer sent. If an icon fails to load, that row falls back to its coloured letter tile. The cost of this is that every visitor's browser contacts the icon service, which is a third party. When the section first appears, ScrollTrigger positions are refreshed because the page below it moves.

## 13d. Showcase setup script

`server/scripts/seedShowcase.js` connects with `MONGO_URI` and calls `seedShowcase` in `services/showcase.service.js`. That function finds or creates the showcase account (the password is hashed with bcrypt, random unless `SHOWCASE_PASSWORD` is given), adds a monitor for each site that is missing (matched by account and URL, so re-running never duplicates), refuses to go past the limit of 20 monitors per account, and creates or updates that account's status page with the monitors in order. A link already used by another account stops it with a clear message.

## 14. Limits and known limitations

| Item | Limit |
|---|---|
| Monitors per user | 20 |
| Interval | 1 to 60 minutes |
| Timeout | 1 to 30 seconds |
| Response body read | 2 MB |
| Redirects followed | 3 |
| Monitors claimed per scheduler run | 200, checked 10 at a time |
| Check history | 30 days |
| Protocols | HTTP and HTTPS, GET and HEAD |

Limitations: one scheduler process, no outbound notifications, no custom request headers yet, only auth routes are rate limited, and cross-site cookies need care when the client and API are on different domains.

## 15. Decisions

| Decision | Reason |
|---|---|
| Cookie JWT instead of localStorage | Script cannot read an httpOnly cookie, which limits damage from XSS |
| Scheduler in the API process | Free hosting, one deployable. Leases make it safe to scale later |
| Lease-based claiming instead of an in-memory lock | Survives restarts and works across instances |
| Failure threshold plus quick re-check | Avoids false alarms without making detection slow |
| Unique partial index for incidents | The database enforces one incident per outage, not just the code |
| TTL index for retention | No cleanup job to maintain |
| No email or other notifications | Out of scope for this version. The dashboard and status page carry incident information |
