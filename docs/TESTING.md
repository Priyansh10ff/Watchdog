# Testing

Every test below was designed against the real endpoints. Run them with Postman (the cookie is kept automatically) and fill in the Result column with the date and Pass or Fail. Add screenshots to `docs/screenshots/`.

Base URL: `http://localhost:5000/api`. Demo site: `http://localhost:4000`.

## Automated tests

Run them from the project folder:

```bash
cd server
npm test

cd ../client
npm test
```

Both use Node's built-in test runner, so they need no extra packages. The server tests need no database and no network: models are replaced with in-memory stand-ins, and the check engine is tested against a small web server started on a random local port. A GitHub Actions workflow (`.github/workflows/ci.yml`) runs both suites and the client build on every push and pull request.

Server: 427 tests in 13 files, about 11 seconds.

| File | Tests | What it covers |
|---|---|---|
| `isPrivateIp.test.js` | 55 | Every private, loopback, link-local and IPv4-mapped IPv6 range, and the public addresses next to them |
| `validateUrl.test.js` | 47 | Schemes, credentials, bad input, local addresses in and out of production, number-encoded addresses |
| `status.machine.test.js` | 20 | The failure threshold, quick re-checks, recovery, and the schedule after each result |
| `incident.flow.test.js` | 16 | Opening an incident at the right check, updating it, the race between two checks, resolving with the duration |
| `checker.test.js` | 43 | The check engine against a real local web server: status codes, keyword, redirects, timeouts, refused and reset connections, DNS failure, large bodies and private addresses in production |
| `checker.flow.test.js` | 9 | A whole outage from first check to recovery, and claiming monitors safely |
| `scheduler.test.js` | 9 | At most 10 checks at once, at most 200 per run, one failing monitor does not stop the rest, no overlapping runs |
| `auth.test.js` | 43 | Registration, login, logout, the session cookie, and the login middleware |
| `monitors.api.test.js` | 90 | Every monitor and incident route over HTTP: validation, ownership, limits, mass-assignment, delete cascade, check-now cooldown |
| `statusPage.test.js` | 50 | The owner's status page routes and the public page: privacy, ordering, states, domains, caching |
| `showcase.test.js` | 16 | The one-command showcase setup |
| `hardening.test.js` | 26 | JSON errors, body limit, security headers, CORS, production proxy setting and the API-wide and login rate limits |
| `publicLimit.test.js` | 3 | The 60 requests a minute limit on the public status page |

Client: 57 tests in 3 files.

| File | Tests | What it covers |
|---|---|---|
| `monitorState.test.js` | 21 | A monitor's state, the sort order of the dashboard and the headline for the overall state |
| `time.test.js` | 24 | "5 min ago", durations such as `2m 5s`, and dates |
| `sentryPose.test.js` | 12 | The three moods of Sentry and how a pose is applied |

Not covered by automated tests: the React components, the animations and anything that needs a real MongoDB. Those are covered by the manual cases below.

Dependency audit (`npm audit`): the client has no known vulnerabilities, and the server has none in its production dependencies. Removing the unused `jest` and `nodemailer` packages leaves three advisories in `nodemon`'s dev-only dependency chain (a denial of service in `braces` that needs attacker-controlled glob patterns), with no upstream fix yet. They are never installed in production.

## Manual tests

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
| 13 | GET /monitors after a monitor has been checked several times | none | each monitor has `recentChecks` (at most 24, oldest first) and `uptime24h` | |
| 14 | GET /monitors for a monitor that has not been checked | none | `recentChecks` is `[]` and `uptime24h` is `null` | |

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

## Interface

| # | Action | Expected | Result |
|---|---|---|---|
| 1 | Open the dashboard with a monitor that has been checked | The card shows the response time, 24 hour uptime, 24 bars (green when up) and Edit, Pause and Delete | |
| 2 | Click Edit on a card | The edit page opens with every field filled in, and the URL is shown but cannot be changed | |
| 3 | Drag the dial | The readout, the highlighted preset and the custom field follow the dial | |
| 4 | Focus the dial and press the arrow keys | The interval steps through 1, 2, 5, 10, 15, 30 and 60 | |
| 5 | Click a preset, then type 17 in the custom field | The dial moves to 17 minutes and the "What will run" panel says every 17 min | |
| 6 | Type 75 or 0 in the custom field | The interval does not change | |
| 7 | Save the edit page without changing anything | Returns to the dashboard and sends no request | |
| 8 | Change only the interval and save | Only that field is sent. The card shows the new "Every N min" and a check runs soon | |
| 9 | Change the keyword while the method is HEAD and save | The server's message is shown in a red alert and the page stays | |
| 10 | Add a monitor with a custom interval of 17 | The new card says "Every 17 min" | |
| 11 | Pause a monitor | The card turns beige, shows "Off" and grey bars. Resume restores it without losing the bars | |
| 12 | Break the demo target and wait for the failure threshold | Red bars appear at the right end of the card, the card turns red and shows "No reply" | |
| 13 | Open `/monitors/123/edit` | "Monitor not found" with a Try again button | |
| 14 | Log in, then open the landing page `/` | The page stays open. The nav shows your initial and name instead of Log in, and the chip opens the dashboard | |
| 15 | Log out, then open `/` | The nav shows Log in and Start monitoring | |

## Status page

| # | Request or action | Body | Expected | Result |
|---|---|---|---|---|
| 1 | GET /status-page | none | 200, `page` is `null` before one exists | |
| 2 | PUT /status-page | `{"slug":"acme","title":"Acme status","monitors":["<monitor id>"]}` | 200, the page is returned and published | |
| 3 | PUT /status-page | `{"slug":"ab","title":"T","monitors":[]}` | 400, the link rules are explained | |
| 4 | PUT /status-page | `{"slug":"has space","title":"T","monitors":[]}` | 400 | |
| 5 | PUT /status-page | `{"slug":"acme","title":"","monitors":[]}` | 400 | |
| 6 | PUT /status-page | `{"slug":"acme","title":"T","monitors":["123"]}` | 400 | |
| 7 | PUT /status-page | a monitor id that belongs to another user | 400, "One or more monitors were not found" | |
| 8 | PUT /status-page as a second user | `{"slug":"acme","title":"T","monitors":[]}` | 409, "That link is already taken" | |
| 9 | GET /status/acme without logging in | none | 200, monitors in the chosen order, no URL anywhere in the response | |
| 10 | GET /status/acme twice within 30 seconds | none | the same `updatedAt` both times | |
| 11 | PUT /status-page with a new title, then GET /status/acme | none | the new title appears at once | |
| 12 | PUT /status-page with `"isPublished":false`, then GET /status/acme | none | 404 "Status page not found" | |
| 13 | GET /status/nothing-here | none | 404, the same message as test 12 | |
| 14 | Break the demo target, then GET /status/acme | none | `overall` is `outage`, the monitor is `down` and an `ongoing` incident is listed | |
| 15 | DELETE /monitors/:id for a monitor on the page, then GET /status-page | none | the monitor id is gone from the page | |
| 16 | GET /status/acme 70 times in a minute | none | the 61st request or so returns 429 | |
| 17 | DELETE /status-page, then again | none | 200, then 404 | |
| 18 | GET, PUT or DELETE /status-page without logging in | none | 401 | |

Interface:

| # | Action | Expected | Result |
|---|---|---|---|
| 19 | Open Status page in the navbar with no page yet | An empty form with a suggested link and title, and a checklist of your monitors | |
| 20 | Type a link with capitals, spaces or symbols | The field turns them into lowercase letters and hyphens | |
| 21 | Tick two monitors, press Publish status page | A green "Saved" message and a live link box with Copy link and Open page | |
| 22 | Press Copy link and paste it into a private window | The public page opens without logging in | |
| 23 | Use a link another user already has | A red alert says the link is taken and the page stays | |
| 24 | Turn the switch off and save | The box says the page is hidden, and the link shows "Status page not found" | |
| 25 | Press Select all with more than 20 monitors | It stops at 20 | |
| 26 | Delete the page and confirm | The form resets and the link stops working | |
| 27 | Open the public page with a monitor down | The page and headline turn red, the bar shows red failures and the incident reads Ongoing | |
| 28 | Open the public page and read every line | No URL, error message or cause is shown | |

## Landing page ticker

| # | Action | Expected | Result |
|---|---|---|---|
| 29 | Open the landing page before running the showcase script | No ticker section, and the rest of the page is normal. `GET /api/status/world` returns 404 | |
| 30 | Run `node scripts/seedShowcase.js` in `server`, wait a minute, then reload the landing page | A yellow section after the story shows five rows | |
| 31 | Watch for 10 seconds | Every few seconds the top row slides out and a new one comes in from the bottom, with no jump when the list wraps | |
| 32 | Move the pointer over the ticker | The scrolling stops. Moving away resumes it | |
| 33 | Scroll the section out of view and back | It does not keep running off screen and picks up when visible | |
| 34 | Break one showcase monitor | Its row says Not responding with a red dot and red bars | |
| 35 | Hide the showcase page or delete it | The section disappears from the landing page within a minute | |
| 36 | Turn on reduced motion in the system settings | The five first sites show and nothing moves | |
| 37 | Log in and open the landing page | The button says Add your own site and opens Add monitor | |

## Confirmation and card readout

| # | Action | Expected | Result |
|---|---|---|---|
| 38 | Press Delete on a monitor card | A dialog appears inside the page, naming the monitor. No browser pop-up appears | |
| 39 | Press Cancel, then Delete again and press Escape, then again and click the dark area | Each closes the dialog, the monitor stays and focus returns to the Delete button | |
| 40 | Open the dialog and press Tab and Shift+Tab repeatedly | Focus stays on the two dialog buttons. The page behind does not scroll | |
| 41 | Confirm the deletion | The card disappears and its incidents and history are gone | |
| 42 | Stop the server and confirm a deletion | The dialog closes and a red message on the page says it could not be deleted | |
| 43 | Press Delete page on the status page settings | The same kind of dialog asks about the status page | |
| 44 | Point a monitor at a site that times out and watch the card after the first failed check | The card says "No reply", never "undefined ms", and its size does not change | |
| 45 | Run `node scripts/seedShowcase.js` a second time | It says 0 monitors added and 12 already there, and the page is unchanged | |
| 46 | Run it with `SHOWCASE_PASSWORD` set on a fresh database, then log in as `showcase@watchdog.local` | The dashboard shows the 12 monitors | |

## Icons and domains

| # | Action | Expected | Result |
|---|---|---|---|
| 47 | Open the landing page with the `world` page published | Each ticker row shows the site's own icon and its domain. This works even before you re-run the showcase script, because the 12 sites are recognised by name | |
| 48 | Block `www.google.com` for the page (network tab, block request domain) and reload | Rows switch to DuckDuckGo's icon service and still show icons. Block that too and they use each site's own favicon, and with all three blocked they show their coloured letter tiles | |
| 49 | GET /status/world and read the JSON | Each monitor has a `domain` such as `github.com`. No full URL or path appears | |
| 50 | On the status page settings, turn off Show site domains and save, then GET /status/world | Every `domain` is `null` and the ticker shows letter tiles | |
| 51 | Turn it on for a monitor whose URL has a path or query, then read the public page | Only the host name is shown | |
| 52 | Open a public status page whose owner turned domains on | The domain shows under each monitor name | |
