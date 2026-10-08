# Testing

Every test below was designed against the real endpoints. Run them with Postman (the cookie is kept automatically) and fill in the Result column with the date and Pass or Fail. Add screenshots to `docs/screenshots/`.

Base URL: `http://localhost:5000/api`. Demo site: `http://localhost:4000`.

## Auth

| # | Request | Body | Expected | Result |
|---|---|---|---|---|
| 1 | GET /health | none | 200 | |
| 2 | POST /auth/register | `{"name":"Test","email":"test@example.com","password":"password123"}` | 201, no password in the user, cookie set | |
| 3 | POST /auth/register | same body | 409 | |
| 4 | POST /auth/register | `{"email":"a@example.com","password":"password123"}` | 400 | |
| 5 | POST /auth/register | `{"name":"A","email":"a@example.com","password":"12345"}` | 400 | |
| 6 | POST /auth/register | `{"name":"A","email":"abc","password":"password123"}` | 400 | |
| 7 | POST /auth/register | `{"name":"A","email":{"$gt":""},"password":"password123"}` | 400 | |
| 8 | POST /auth/login | `{"email":"test@example.com","password":"password123"}` | 200, cookie set | |
| 9 | POST /auth/login | wrong password | 401 | |
| 10 | POST /auth/login | unknown email | 401, same message as test 9 | |
| 11 | GET /auth/me | none | 200 | |
| 12 | POST /auth/logout, then GET /auth/me | none | 200, then 401 | |
| 13 | Eleven login attempts within 15 minutes | any | the 11th returns 429 | |

## Monitors

| # | Request | Body | Expected | Result |
|---|---|---|---|---|
| 1 | POST /monitors | `{"name":"Demo","url":"http://localhost:4000/health","intervalMinutes":1,"failureThreshold":2,"timeoutMs":5000}` | 201 | |
| 2 | POST /monitors | same body | 409 | |
| 3 | POST /monitors | `{"name":"Bad","url":"not-a-url"}` | 400 | |
| 4 | POST /monitors | `{"name":"Head","url":"https://example.org","method":"HEAD","keyword":"hello"}` | 400 | |
| 5 | POST /monitors | `{"name":"Interval","url":"https://example.net","intervalMinutes":0}` | 400 | |
| 6 | GET /monitors | none | 200, the user's monitors only | |
| 7 | GET /monitors/:id | none | 200 | |
| 8 | GET /monitors/123 | none | 404 | |
| 9 | PATCH /monitors/:id | `{"intervalMinutes":5}` | 200 | |
| 10 | PATCH /monitors/:id | `{}` | 400 | |
| 11 | PATCH /monitors/:id/toggle (twice) | none | paused, then resumed | |
| 12 | DELETE /monitors/:id | none | 200, its results and incidents are deleted | |

## Checker

| # | Action | Expected | Result |
|---|---|---|---|
| 1 | Add a monitor for `http://localhost:4000/health` | within seconds the status is `up` with a response time | |
| 2 | GET /monitors/:id/results | recent checks and `last24h` statistics | |
| 3 | Open `http://localhost:4000/control/down`, then POST /monitors/:id/check twice, 10 seconds apart | the second check turns the status to `down` (threshold 2) | |
| 4 | Open `http://localhost:4000/control/up`, then POST /monitors/:id/check | status `up` again, transition `recovered` | |
| 5 | POST /monitors/:id/check twice within 10 seconds | the second call returns 429 | |
| 6 | Monitor `http://localhost:4000/page` with keyword `Sign in` | up | |
| 7 | Same URL with keyword `Checkout` | down, "Keyword not found" | |
| 8 | Monitor `http://localhost:4000/redirect` with the default codes | up (redirect followed) | |
| 9 | Monitor `http://localhost:4000/hang` with `timeoutMs` 2000 | down, "Timed out after 2000 ms" | |
| 10 | Monitor `http://localhost:4999/` | down, "Connection refused" | |
| 11 | Pause a monitor | it stops being checked | |

## Incidents

| # | Action | Expected | Result |
|---|---|---|---|
| 1 | Break the demo site and let the monitor go down | one incident is opened | |
| 2 | GET /incidents?status=active | 1 incident, `failedChecks` grows on later checks | |
| 3 | PATCH /incidents/:id/acknowledge | 200, status `acknowledged` | |
| 4 | PATCH /incidents/:id/acknowledge again | 400 | |
| 5 | Restore the demo site | the incident is resolved with a duration | |
| 6 | GET /incidents/:id | the incident and the checks recorded during it | |
| 7 | GET /incidents?status=resolved | contains the resolved incident | |
| 8 | GET /incidents?status=wrong | 400 | |
| 9 | GET /monitors/:id/incidents | only that monitor's incidents | |
| 10 | Break the site again | a new incident is opened, the old one is unchanged | |
