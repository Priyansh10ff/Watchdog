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
