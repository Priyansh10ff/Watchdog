# Database schema

MongoDB with Mongoose. Collections: `users`, `monitors`, `checkresults`, `incidents`.

## User

| Field | Type | Notes |
|---|---|---|
| name | String | required, max 60 |
| email | String | required, unique, lowercase |
| password | String | bcrypt hash |
| createdAt | Date | |

## Monitor

| Field | Type | Notes |
|---|---|---|
| user | ObjectId | owner, required |
| name | String | required, max 60 |
| url | String | http or https, no credentials in the URL |
| method | String | `GET` or `HEAD` |
| intervalMinutes | Number | 1 to 60 |
| timeoutMs | Number | 1000 to 30000 |
| expectedStatusCodes | [Number] | 1 to 20 codes between 100 and 599 |
| keyword | String | optional, max 100, needs GET |
| failureThreshold | Number | 1 to 10 |
| isActive | Boolean | false when paused |
| encryptedHeaders | String | hidden by default, reserved for authenticated checks |
| status | String | `unknown`, `up` or `down` |
| consecutiveFailures | Number | |
| lastCheckedAt | Date | |
| lastResponseTimeMs | Number | |
| nextCheckAt | Date | used by the scheduler |
| createdAt, updatedAt | Date | |

Indexes: `(user, createdAt)` for the dashboard, `(isActive, nextCheckAt)` for the scheduler, unique `(user, url)` to prevent duplicates. A user can have at most 20 monitors.

## CheckResult

| Field | Type | Notes |
|---|---|---|
| monitor | ObjectId | |
| isUp | Boolean | |
| statusCode | Number | empty when there was no response |
| responseTimeMs | Number | |
| errorMessage | String | empty when up |
| checkedAt | Date | |

Indexes: `(monitor, checkedAt)` and a TTL index that deletes documents 30 days after `checkedAt`.

## Incident

| Field | Type | Notes |
|---|---|---|
| monitor | ObjectId | |
| user | ObjectId | owner |
| status | String | `open`, `acknowledged` or `resolved` |
| isResolved | Boolean | supports the partial unique index |
| startedAt | Date | time of the first failing check |
| acknowledgedAt | Date | |
| resolvedAt | Date | |
| durationMs | Number | set when resolved |
| cause | { statusCode, errorMessage } | from the first failing check |
| lastError | { statusCode, errorMessage, at } | updated on every failed check |
| failedChecks | Number | |
| createdAt, updatedAt | Date | |

Indexes: unique `monitor` where `isResolved` is false (one unresolved incident per monitor), `(user, startedAt)`, `(user, status, startedAt)` and `(monitor, startedAt)`.

## StatusPage

| Field | Type | Notes |
|---|---|---|
| user | ObjectId | owner, unique: one page per user |
| slug | String | unique, lowercase, the public link name |
| title | String | up to 60 characters |
| monitors | [ObjectId] | the monitors shown, in display order |
| isPublished | Boolean | `false` hides the page without deleting it |
| showDomains | Boolean | default `false`. When `true` the public page shows each monitor's host name, never the full URL |
| createdAt, updatedAt | Date | |

Indexes: unique `user` and unique `slug`.
