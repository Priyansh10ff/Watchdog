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
| GET | /monitors | List the user's monitors, newest first. Each monitor also has `recentChecks` and `uptime24h` |
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

List response, per monitor, in addition to the monitor fields:

```json
{
  "recentChecks": [{ "isUp": true, "responseTimeMs": 138, "checkedAt": "..." }],
  "uptime24h": 99.8
}
```

`recentChecks` holds the last 24 checks, oldest first, and is an empty list for a monitor that has not been checked. `uptime24h` is the percentage of checks that were up in the last 24 hours with one decimal, or `null` when there are none.

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

## Status page

Public, no login. Rate limited to 60 requests per minute per IP and cached for 30 seconds.

| Method | Path | Description |
|---|---|---|
| GET | /status/:slug | The public status page data for a published page |

Response:

```json
{
  "success": true,
  "page": { "slug": "acme", "title": "Acme status" },
  "overall": "operational",
  "updatedAt": "2026-10-08T12:00:00.000Z",
  "monitors": [
    {
      "name": "Website",
      "domain": null,
      "status": "up",
      "responseTimeMs": 120,
      "lastCheckedAt": "...",
      "uptime24h": 99.8,
      "recentChecks": [{ "isUp": true, "responseTimeMs": 118 }]
    }
  ],
  "incidents": [
    { "monitorName": "API", "status": "ongoing", "startedAt": "...", "resolvedAt": null, "durationMs": null }
  ]
}
```

`overall` is `operational`, `degraded` (a monitor is slow), `outage` (a monitor is down), `paused` or `empty`. A monitor `status` is `up`, `slow`, `down`, `paused` or `unknown`. Monitors appear in the order chosen by the owner, with the last 30 checks oldest first. `incidents` are the last 14 days, up to 10, newest first, with `ongoing` or `resolved`. Monitor URLs, ids, error messages and causes are never included. `domain` is `null` unless the owner turned on `showDomains`, and then it is the host name only, such as `github.com`, without `www`, the port, the path or the query. An unknown slug, a malformed slug or an unpublished page returns 404 with the same message.

Owner endpoints (login required, one page per user):

| Method | Path | Description |
|---|---|---|
| GET | /status-page | The user's page, or `null` |
| PUT | /status-page | Create or update the page |
| DELETE | /status-page | Delete the page |

PUT body:

```json
{ "slug": "acme", "title": "Acme status", "monitors": ["<monitor id>"], "isPublished": true, "showDomains": false }
```

Rules and errors:
- `slug`: 3 to 40 characters, lowercase letters, numbers and hyphens, starting and ending with a letter or number. It is trimmed and lowercased.
- `title`: 1 to 60 characters. `monitors`: up to 20 ids, all owned by the user, duplicates collapsed. `isPublished` defaults to `true` and `showDomains` to `false`. Both must be true or false when given.
- 400: invalid fields, or a monitor that does not exist or belongs to someone else.
- 409: the link is already taken.
- 404 on DELETE when the user has no page.
- Deleting a monitor removes it from every status page.

## Errors and limits

These apply to every route under `/api`.

| Status | Message | When |
|---|---|---|
| 400 | `Invalid JSON` | The body is not valid JSON |
| 400 | `Bad request` | Another client error, such as a malformed path |
| 401 | `Not authenticated`, `Unauthorized` | No session, or an invalid or expired one |
| 404 | `Route not found` | No such route |
| 413 | `Request body is too large` | The body is over 10 kB |
| 429 | `Too many requests, slow down and try again later` | More than 600 requests in 15 minutes from one IP (`API_RATE_LIMIT`). The health check is not counted |
| 429 | `Too many attempts, try again in 15 minutes` | More than 10 register or login attempts in 15 minutes from one IP |
| 429 | `Too many requests, try again in a minute` | More than 60 requests a minute to `GET /status/:slug` from one IP |
| 500 | `Internal Server Error` | Anything unexpected. Details are only written to the server log |

Every error body is `{ "success": false, "message": "..." }`. A 429 carries `Retry-After` and `X-RateLimit-*` headers.
