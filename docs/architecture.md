# Architecture

## Components

| Part | Responsibility |
|---|---|
| React client | Pages for login, signup, dashboard, add monitor and incidents. Talks to the API with Axios and the session cookie. |
| Express API | Authentication, monitor management, results and incidents endpoints. |
| Scheduler | `jobs/scheduler.js`. Runs every minute inside the API process and once at startup. |
| Checker service | `services/checker.service.js`. Performs one HTTP check and stores the result. |
| Incident service | `services/incident.service.js`. Holds the status machine and opens or resolves incidents. |
| MongoDB | Users, monitors, check results and incidents. |

## Check pipeline

1. The scheduler claims due monitors with an atomic `findOneAndUpdate` on `nextCheckAt` that moves it two minutes ahead (a lease). Another instance, or a restart, cannot claim the same monitor.
2. Claimed monitors are checked 10 at a time. An error in one monitor never stops the others.
3. `runCheck` makes the HTTP request and returns `isUp`, `statusCode`, `responseTimeMs` and `errorMessage`. It never throws.
4. `applyResult` updates the monitor (status, consecutive failures, last check time, next check time) and returns a transition: `down`, `recovered` or nothing.
5. A `CheckResult` is saved and the monitor is saved.
6. `handleIncident` opens an incident on the first confirmed failure, increments it while the outage lasts, and resolves it on recovery. A failure inside incident handling is logged and never breaks checking.

## What counts as up

A check is up when the response status is in the monitor's expected status codes and, if a keyword is set, the body contains it.

- Redirects: the first response is judged first. If it is a redirect that is not in the expected list, the checker follows up to 3 redirects and judges the final response.
- Login-protected sites: a monitor never logs in. The user lists codes such as 401 and 403 as expected, because those answers prove the server is alive.
- Timeout: the whole request is limited by the monitor's timeout.

## Status machine

- A failed check increments `consecutiveFailures`. The monitor becomes `down` only when that count reaches `failureThreshold`. One dropped request cannot cause an alarm.
- A successful check resets the counter. If the monitor was `down`, the transition is `recovered`.
- After a failure, or while down, the next check is scheduled within one minute, so outages are confirmed and recoveries noticed quickly even on long intervals. A healthy monitor waits its full interval.

## Incidents

- One unresolved incident per monitor, enforced by a unique partial index.
- `startedAt` and the cause come from the first failing check after the last successful one.
- The status is `open`, `acknowledged` or `resolved`. Resolving stores the total duration.
- Creating an incident is idempotent. If two writers race, the duplicate-key error is caught and the existing incident is used.

## Security

- Passwords are hashed with bcrypt. The session is a JWT in an httpOnly cookie, `secure` and `sameSite: none` in production.
- Request types are validated, which blocks NoSQL injection through objects in the body.
- Every monitor and incident query is filtered by the logged-in user. Another user's resource returns 404.
- Register and login are rate limited. helmet sets secure headers. CORS allows only the client origin.
- In production the checker blocks private, loopback and link-local addresses. The block is applied at DNS lookup time, for IP-literal URLs and for redirect targets, so a changing DNS answer cannot bypass it.
- Secrets live in environment variables and `.env` is ignored by Git.

## Error handling

- Controllers return `{ success, message }` with 400 for invalid input, 401 when not logged in, 403 for the monitor limit, 404 for missing resources, 409 for duplicates, 429 for too many requests and 500 for unexpected errors.
- Check failures become readable messages such as "Timed out after 5000 ms", "Connection refused", "DNS lookup failed" and "Unexpected status 503".
- The client shows loading, empty, error and retry states.

## Data retention

Check results expire automatically after 30 days through a MongoDB TTL index.
