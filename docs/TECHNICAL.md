# Watchdog: Technical Documentation

How Watchdog is built and why. For requirements see [PRD.md](./PRD.md), for the product overview see [PRODUCT.md](./PRODUCT.md). Endpoints, collections, hosting and testing are all covered below.

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

Collections: `users`, `monitors`, `checkresults`, `incidents`, `statuspages`, `webhookchannels`. Notable choices:

- Monitor status and last result are stored on the monitor so the dashboard needs one query.
- `checkresults` has a TTL index that deletes documents 30 days after `checkedAt`, so no cleanup job is needed.
- The scheduler query is covered by an `(isActive, nextCheckAt)` index.
- A unique `(user, url)` index prevents duplicate monitors.

## 9. API

Every endpoint, with its body and error codes:

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
| `SEED_SHOWCASE` | no | `true` in production, `false` otherwise | `true` makes the API create the landing page ticker's status page on start if it does not exist. `false` turns that off |
| `SHOWCASE_EMAIL` | no | `showcase@watchdog.local` | Account that owns the ticker's monitors and page |
| `SHOWCASE_PASSWORD` | no | random | Password for the showcase account when it is created, 8 to 72 characters. Set it before the first start if you want to log in and adjust the monitors |
| `SHOWCASE_SLUG` | no | `world` | Link name of the ticker's page. Set `VITE_SHOWCASE_SLUG` in the client to match |
| `SHOWCASE_TITLE` | no | `Popular websites` | Title of the ticker's page |
| `CLIENT_URL` is also used in alert messages | | | The link in a webhook message points at `CLIENT_URL` + `/incidents`. Without it the message has no link |
| `API_RATE_LIMIT` | no | `600` | Requests allowed per IP every 15 minutes across the whole API, except the health check |
| `COOKIE_SAMESITE` | no | `none` in production, `lax` otherwise | `SameSite` of the session cookie: `lax`, `strict` or `none`. Use `lax` behind the Vercel proxy, where the cookie is first-party. `none` is always sent as secure |
| `TRUST_PROXY` | no | `1` | Number of proxy hops in front of the API in production, used to find the visitor's IP for rate limiting. Use `2` behind the Vercel proxy option |

Client (`client/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | API base URL |
| `VITE_SHOWCASE_SLUG` | `world` | Link name of the status page shown as the landing page ticker |
| `VITE_FAVICON_URL` | Google's favicon service | First icon service the ticker tries, with `{domain}` where the host name goes. DuckDuckGo's icon service and the site's own favicon are tried after it |

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

Automated tests use Node's built-in test runner: 607 server tests and 97 client tests, run with `npm test` in each folder and in CI on every push. The server tests replace the database models with in-memory stand-ins and test the check engine against a local web server, so they need no database or internet. `scripts/smokeTest.mjs` (run with `npm run smoke -- <address>`) checks a deployed app over HTTP, and its own tests (`npm run test:smoke`) run it against a copy of the API on in-memory data. The React components, the animations and the real database are not covered by them and are checked by hand.

## 13a. Client animation

- `components/Sentry.jsx` is the animated dog. It is plain DOM with `data-part` attributes. `utils/sentryPose.js` defines three poses (`up`, `slow`, `down`) as values for ears, eyes, brows, mouth, sound waves and z's, and helpers to apply them with GSAP or to add them to a timeline.
- When the `mode` prop changes, `Sentry` tweens to the new pose and starts or stops its barking loops (shake, jaw, waves). Idle loops (breathing, blinking, floating z's) run inside a `gsap.context`, which is reverted on unmount.
- The landing page (`pages/Landing.jsx`) is lazy-loaded so ScrollTrigger is not part of the main bundle. Its scroll story is one scrubbed timeline over a pinned (sticky) stage. It is created only at 1280 px and wider and when reduced motion is off. Below that, or with reduced motion, the story is shown as stacked cards.
- React owns the markup and the colour classes. GSAP owns transforms and the properties it tweens, so React state never writes to the same inline styles.

## 13b. Monitor list history

`GET /monitors` adds two fields to every monitor so the dashboard cards need one request: `recentChecks` (the last 24 check results, oldest first) and `uptime24h`. The controller runs one indexed query per monitor on `(monitor, checkedAt)` for the recent checks and one aggregation over the last 24 hours for all of the user's monitors, so a list call costs at most 20 small queries plus one grouped read. The dashboard polls it every 30 seconds.

The edit page loads `GET /monitors/:id`, compares the form with the saved monitor and sends only the changed fields to `PATCH /monitors/:id`. The `IntervalDial` component maps the interval to the knob angle on a logarithmic scale between 1 and 60 minutes and snaps to a preset when the value is within about 8 percent of it.

## 13c. Landing page ticker

`components/LiveTicker.jsx` fetches `GET /api/status/<slug>` (the `VITE_SHOWCASE_SLUG` page, `world` by default) when the landing page loads and again every 60 seconds. If a request fails, it retries after 3, 6, 12, 20 and 30 seconds and then goes back to every 60 seconds (`utils/poller.js`), so a cold start of the API costs seconds, not a minute, and a page created a moment after the visit is picked up by itself. While the request fails, the page does not exist or it has fewer than 5 monitors, the section renders nothing, so the landing page never shows made-up data. Once data has arrived, a failed refresh keeps showing the last good data.

With data, it shows a window five rows tall. The rows are the monitors followed by the first five again. A GSAP timeline slides the track up one row every 3.2 seconds (2.5 seconds still, 0.7 seconds moving) and, after the last row, restarts from the identical repeated view, so the loop has no jump. It pauses when the section is off screen and when the pointer is over it. With reduced motion it shows the first five sites without scrolling. The repeated rows are hidden from screen readers. Each row shows the site's own icon, loaded by the visitor's browser with no referrer sent. The domain comes from the status page when the owner turned on `showDomains`, and otherwise from a built-in list of the 12 showcase sites matched by name (ignoring case and spaces), so the icons appear even before the setting is on. The browser tries three sources in turn, moving on when one fails to load: a favicon service (Google's by default, or `VITE_FAVICON_URL`) at 64 pixels shown at 32, then DuckDuckGo's icon service, then the site's own `/favicon.ico`. If all three fail, that row shows its coloured letter tile. The cost is that visitors' browsers contact those services, which are third parties. When the section first appears, ScrollTrigger positions are refreshed because the page below it moves.

## 13d. Showcase setup script

`server/scripts/seedShowcase.js` connects with `MONGO_URI` and calls `seedShowcase` in `services/showcase.service.js`. That function finds or creates the showcase account (the password is hashed with bcrypt, random unless `SHOWCASE_PASSWORD` is given), adds a monitor for each site that is missing (matched by account and URL, so re-running never duplicates), refuses to go past the limit of 20 monitors per account, and creates or updates that account's status page with the monitors in order. A link already used by another account stops it with a clear message.

The API calls the same setup by itself on start. After the server is listening, `server/index.js` asks `showcaseAutoSeedEnabled()` (true when `SEED_SHOWCASE=true`, or when it is not set and `NODE_ENV` is `production`) and then `ensureShowcase`, which does nothing if any status page with that link exists, even a hidden one or one owned by another account, and otherwise runs `seedShowcase` with the `SHOWCASE_*` settings. It runs in the background: a failure is logged as `Showcase setup skipped: <reason>` and never stops the server or the scheduler, and a successful run logs `Showcase page "world" created with 12 sites`. Because it only acts when no such page exists, restarting the API never duplicates anything and never undoes a page the owner hid.

## 13d2. The first check of a new monitor

`POST /monitors` starts the first check immediately with `checkSoonAndWait`, which races the running check against a 3 second timer. If the check wins, the answer carries the finished monitor plus its `recentChecks` and `uptime24h`, so the dashboard card is complete the moment it is opened. If the timer wins, the answer returns the monitor as created and the check carries on in the background, because a slow or unreachable site must never hold up the form.

On the client, `utils/monitorState.js` exposes `isAwaitingFirstCheck`. A card with no result yet reads `Checking...` instead of a blank value, and the dashboard polls every 5 seconds instead of 30 while any monitor is still unchecked, dropping back once every monitor has a result.

## 13e. Alerts

`services/alert.service.js` sends a message to the owner's webhook channels when an incident opens and when it resolves, and nothing in between: later failed checks only update the open incident.

**How it is wired.** `services/incident.service.js` keeps a small set of listeners (`onIncidentEvent`) and emits `opened` or `resolved` after the incident has been written. `server/index.js` registers `notifyIncident` as a listener on start. Listeners run detached, so a slow or failing webhook never delays a check, and a listener that throws is logged and ignored. With no listener registered, checks and incidents behave exactly as before, which is why the whole test suite runs without alerts.

**Delivery.** One POST with a 5 second timeout. It retries once after 1.5 seconds, but only when retrying could help: a 5xx, a 429 or a connection problem. A 4xx, a redirect or a blocked address is final. Redirects are never followed, so a webhook cannot be bounced to another host. The result of each attempt is stored on the channel as `lastDelivery`, which is what the Alerts page shows. All of an account's channels are sent at the same time.

**Who it says it is.** Discord sits behind Cloudflare, which refuses requests whose `User-Agent` it does not recognise and answers 429 before Discord ever sees the message. Discord channels are therefore sent `DiscordBot (<repo url>, 1.0)`, the form Discord's own API documents; Slack and generic channels keep `WatchdogBot/1.0`. A failed delivery records the service's own reason (`HTTP 429: You are being rate limited. (retry in 5s)`) rather than the bare number, and says plainly when something blocked the request before the service saw it.

**Message shapes.** Slack gets plain text with the Slack markup characters escaped. Discord gets an embed with `allowed_mentions` empty, so a monitor named `@everyone` cannot ping a server. A `generic` channel gets JSON plus `X-Watchdog-Timestamp` and, when the channel has a secret, `X-Watchdog-Signature`: `sha256=` followed by the HMAC SHA-256 of `<timestamp>.<raw body>`. Messages carry the monitor's name and host name, never the full URL, so a webhook receiver cannot learn the address or any query string.

**What keeps it safe.**

| Risk | What stops it |
|---|---|
| SSRF: a webhook address aimed at the server's own network | The same protection the checker uses (`utils/safeHttp.js`): private, loopback and link-local addresses are blocked at DNS lookup time and for IP-literal addresses, in production |
| A fake Slack or Discord address | In production a `slack` channel must be on `hooks.slack.com` under `/services/`, `/triggers/` or `/workflows/`, and a `discord` channel on a Discord host under `/api/webhooks/` |
| The webhook address leaking | Stored `select: false`, never in an API response (only a masked `urlPreview`), and stripped out of error text before anything is logged |
| Markup or mention injection from a monitor name | Escaped per format, and mentions switched off for Discord |
| Using Watchdog to flood a third party | 3 channels per account, one message per transition, at most two attempts, and a 10 second cooldown on test messages |

**Limits.** Up to 3 channels per account. Outbound only, so there is no email or SMS. Addresses are stored as plain text, which is normal for this kind of tool but worth encrypting at rest in a later version.

## 14. Limits and known limitations

| Item | Limit |
|---|---|
| Monitors per user | 20 |
| Alert channels per user | 3 |
| Alert delivery timeout | 5 seconds, one retry |
| Interval | 1 to 60 minutes |
| Timeout | 1 to 30 seconds |
| Response body read | 2 MB |
| Redirects followed | 3 |
| Monitors claimed per scheduler run | 200, checked 10 at a time |
| Check history | 30 days |
| Protocols | HTTP and HTTPS, GET and HEAD |

Limitations: one scheduler process, alerts go to webhooks only (no email or SMS), no custom request headers yet, and cross-site cookies need care when the client and API are on different domains.

## 15. Decisions

| Decision | Reason |
|---|---|
| Cookie JWT instead of localStorage | Script cannot read an httpOnly cookie, which limits damage from XSS |
| Scheduler in the API process | Free hosting, one deployable. Leases make it safe to scale later |
| Lease-based claiming instead of an in-memory lock | Survives restarts and works across instances |
| Failure threshold plus quick re-check | Avoids false alarms without making detection slow |
| Unique partial index for incidents | The database enforces one incident per outage, not just the code |
| TTL index for retention | No cleanup job to maintain |
| Webhook alerts rather than email or SMS | Webhooks are plain HTTP, so they work on free hosting with no mail provider, no sender domain and no per-message cost. Slack and Discord are where small teams already are |
| Alerts sent from an incident listener, not from the checker | The checker stays about checking, and a slow or broken webhook can never delay or fail a check |
| Only on open and resolve | One message per outage. Alerting on every failed check is the main reason people mute monitoring tools |
