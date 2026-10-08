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
| Monitors | `POST /monitors`, `GET /monitors`, `GET/PATCH/DELETE /monitors/:id`, `PATCH /monitors/:id/toggle`, `GET /monitors/:id/results`, `GET /monitors/:id/incidents`, `POST /monitors/:id/check` |
| Incidents | `GET /incidents`, `GET /incidents/:id`, `PATCH /incidents/:id/acknowledge` |
| Health | `GET /health` |

Error codes: 400 invalid input, 401 not logged in or bad credentials, 403 monitor limit, 404 missing or not yours, 409 duplicate, 429 too many requests, 500 unexpected.

## 10. Security

| Area | Measure |
|---|---|
| Passwords | bcrypt, 8 to 72 characters, never returned by the API |
| Session | JWT in an httpOnly cookie, 7 days. In production the cookie is `secure` and `sameSite: none` |
| Input | Types are checked before use, which blocks NoSQL injection through objects. Ranges and lengths are validated. Unknown fields are never copied into documents |
| Authorization | Every monitor and incident query is scoped to the logged-in user. Another user's resource returns 404 |
| Abuse | 10 requests per 15 minutes per IP on register and login. Monitors limited to 20 per user. Check-now has a 10 second cooldown |
| Transport | CORS allows only `CLIENT_URL` with credentials. `helmet` headers. 10 kB body limit |
| SSRF | In production the checker refuses loopback, private and link-local addresses. The check runs inside a custom DNS lookup, so the address that was validated is the one connected to. IP-literal URLs and redirect targets are checked too. URLs with embedded credentials are rejected |
| Secrets | Only in environment variables. `.env` files are ignored by Git |

Known gap: only the auth routes are rate limited. A limiter for the rest of the API is planned (FR21).

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

Client (`client/.env`):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` | API base URL |

The server refuses to start if `MONGO_URI` or `JWT_SECRET` is missing.

## 12. Local development

See the README for the commands. Notes:

- `NODE_ENV` is not `production` locally, so `localhost` targets are allowed. That is how `demo-target` works.
- If your network blocks MongoDB SRV lookups, use the non-SRV connection string from Atlas locally.
- `npx nodemon` restarts the API on file changes. Changing `.env` needs a manual restart (`rs`).

## 13. Testing

Manual test cases with expected results are in [TESTING.md](./TESTING.md). Automated tests are not written yet (FR20). The planned first targets are the status machine, `isPrivateIp`, `validateUrl` and the incident transitions, since they are pure logic.

## 13a. Client animation

- `components/Sentry.jsx` is the animated dog. It is plain DOM with `data-part` attributes. `utils/sentryPose.js` defines three poses (`up`, `slow`, `down`) as values for ears, eyes, brows, mouth, sound waves and z's, and helpers to apply them with GSAP or to add them to a timeline.
- When the `mode` prop changes, `Sentry` tweens to the new pose and starts or stops its barking loops (shake, jaw, waves). Idle loops (breathing, blinking, floating z's) run inside a `gsap.context`, which is reverted on unmount.
- The landing page (`pages/Landing.jsx`) is lazy-loaded so ScrollTrigger is not part of the main bundle. Its scroll story is one scrubbed timeline over a pinned (sticky) stage. It is created only at 1280 px and wider and when reduced motion is off. Below that, or with reduced motion, the story is shown as stacked cards.
- React owns the markup and the colour classes. GSAP owns transforms and the properties it tweens, so React state never writes to the same inline styles.

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
