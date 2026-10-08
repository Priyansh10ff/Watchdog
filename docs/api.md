# API reference

Base URL: `http://localhost:5000/api`

All responses are JSON shaped as `{ "success": true|false, "message": "...", ... }`. Every route except `/health`, `/auth/register` and `/auth/login` needs the session cookie set by login or register.

## Health

| Method | Path | Description |
|---|---|---|
| GET | /health | Server is running |

## Auth

| Method | Path | Body | Success |
|---|---|---|---|
| POST | /auth/register | `name`, `email`, `password` (8 to 72 characters) | 201 with `user`, sets cookie |
| POST | /auth/login | `email`, `password` | 200 with `user`, sets cookie |
| GET | /auth/me | none | 200 with `user` |
| POST | /auth/logout | none | 200, clears cookie |

Register and login share a rate limit of 10 requests per 15 minutes per IP and return 429 when exceeded. Errors: 400 invalid input, 401 invalid credentials or not logged in, 409 email already registered.

## Monitors

| Method | Path | Description |
|---|---|---|
| POST | /monitors | Create a monitor. Starts an immediate check |
| GET | /monitors | List the user's monitors, newest first |
| GET | /monitors/:id | One monitor |
| PATCH | /monitors/:id | Update `name`, `method`, `intervalMinutes`, `timeoutMs`, `expectedStatusCodes`, `keyword`, `failureThreshold`. The URL cannot change |
| PATCH | /monitors/:id/toggle | Pause or resume. Resuming starts an immediate check |
| GET | /monitors/:id/results?limit=50 | Latest checks (max 200) and last 24 hour statistics |
| GET | /monitors/:id/incidents | Incidents of one monitor, same filters as `/incidents` |
| POST | /monitors/:id/check | Run a check now |
| DELETE | /monitors/:id | Delete the monitor, its results and its incidents |

Create body example:

```json
{
  "name": "Marketing site",
  "url": "https://example.com",
  "method": "GET",
  "intervalMinutes": 5,
  "timeoutMs": 10000,
  "expectedStatusCodes": [200, 301],
  "keyword": "Welcome",
  "failureThreshold": 3
}
```

Only `name` and `url` are required. Defaults: GET, 1 minute, 10000 ms, `[200]`, no keyword, threshold 3.

Rules and errors:
- 400: invalid fields, a keyword with the HEAD method, or an empty update.
- 403: more than 20 monitors.
- 404: unknown id or a monitor that belongs to another user.
- 409: the user already monitors that URL.
- Check now returns 400 for a paused monitor and 429 if the monitor was checked in the last 10 seconds. The response includes `result`, `transition`, `incidentEvent`, `incident` and the updated `monitor`.

Results response:

```json
{
  "success": true,
  "results": [{ "isUp": true, "statusCode": 200, "responseTimeMs": 138, "errorMessage": "", "checkedAt": "..." }],
  "last24h": { "checks": 1440, "uptimePercent": 99.86, "avgResponseTimeMs": 142 }
}
```

## Incidents

| Method | Path | Description |
|---|---|---|
| GET | /incidents | List the user's incidents |
| GET | /incidents/:id | One incident and the checks recorded during it (max 100, newest first) |
| PATCH | /incidents/:id/acknowledge | Acknowledge an open incident |

Query parameters for the list:

| Name | Values | Default |
|---|---|---|
| status | `active` (not resolved), `open`, `acknowledged`, `resolved`, `all` | `all` |
| monitor | a monitor id | all monitors |
| page | number | 1 |
| limit | 1 to 50 | 20 |

The list returns `incidents` (each with the monitor's name, url and status), `total`, `page` and `pages`. An invalid `status` or `monitor` returns 400. Acknowledging an incident that is already acknowledged or resolved returns 400. An unknown id returns 404.
