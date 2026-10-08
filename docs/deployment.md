# Deployment

Plan: MongoDB Atlas for the database, Render for the API, Vercel for the client. All three have free tiers.

## Order of steps

About 40 minutes. The order matters because each step needs a value from the one before.

1. Push everything to GitHub and wait for the CI run to turn green.
2. Atlas: create the cluster, a database user and network access, and copy the connection string (section 2).
3. Render: create the services from `render.yaml` and open `/api/health` (section 3).
4. Keep the API awake with an external pinger (section 3).
5. Vercel: add `client/vercel.json` with the Render address, then import the repository (sections 4 and 5).
6. Render: set `CLIENT_URL` to the Vercel address and redeploy.
7. Run the showcase script against the Atlas database (section 6a).
8. Go through the verification list (section 7), then put the live links in the README.

Never paste the Atlas connection string, `JWT_SECRET` or any password into a chat, an issue or a commit. Share only the public addresses and the text of error messages.

Related: [TECHNICAL.md](./TECHNICAL.md) · [CHECKLIST.md](./CHECKLIST.md)

---

## 1. Before you start

- The code is pushed to GitHub with no `.env` files committed.
- You have a long random value for `JWT_SECRET`. Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Decide the cookie approach (section 5). The proxy option is recommended.

## 2. Database: MongoDB Atlas

1. Create a free M0 cluster.
2. Database Access: create a user with a strong password.
3. Network Access: allow `0.0.0.0/0`. Free hosts do not have a fixed outbound IP. Keep the database password strong because of this.
4. Connect, then Drivers, and copy the connection string. Replace `<password>` and add the database name before the `?`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/watchdog?retryWrites=true&w=majority
   ```
   URL-encode special characters in the password (`@` becomes `%40`).

Atlas M0 has no automatic backups. Export anything you cannot afford to lose.

## 3. API: Render

**Fastest: the blueprint.** The repository contains `render.yaml`. In the Render dashboard choose New, then Blueprint, pick the repository and apply it. Render asks for two values: `MONGO_URI` (the Atlas string) and `CLIENT_URL` (type `https://placeholder.vercel.app` for now and change it in step 6). It creates `watchdog-api` and `watchdog-demo-target` in Singapore on the free plan, generates `JWT_SECRET` for you and sets everything else in the table below, including `TRUST_PROXY=2` for the Vercel proxy option. If you choose option A in section 5, change `TRUST_PROXY` to `1`.

**By hand:** create a **Web Service** from the GitHub repository.

| Setting | Value |
|---|---|
| Root directory | `server` |
| Runtime | Node |
| Build command | `npm install` |
| Start command | `npm start` |
| Health check path | `/api/health` |

Environment variables:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | the Atlas string above |
| `JWT_SECRET` | the generated random value |
| `JWT_EXPIRES_IN` | `7d` |
| `CLIENT_URL` | your Vercel URL, with no trailing slash |
| `TRUST_PROXY` | `1` for option A below, `2` for option B (see section 5) |
| `API_RATE_LIMIT` | optional, requests per IP every 15 minutes across the API. Default `600`. Raise it if many people share one address, such as a campus network |

After the deploy, open `https://YOUR-SERVICE.onrender.com/api/health`. It should return `{"success":true,"message":"Server is running"}`. The logs should show `DB Connected` and `Scheduler started`.

**Keep it awake.** The scheduler runs inside the API process, so checks stop while the service sleeps. According to Render's documentation, a free web service spins down after 15 minutes without inbound traffic, and the first request after that can take around 30 seconds. Point an external pinger (UptimeRobot, cron-job.org or Better Stack, all with free plans) at `https://YOUR-SERVICE.onrender.com/api/health` with an interval of 5 minutes, and certainly no more than 14.

Free usage is capped at 750 instance hours per workspace per calendar month, and a service uses hours only while it is running. One always-on service uses about 744 hours in a 31-day month, so it fits, but a second always-on service would not. Leave `watchdog-demo-target` asleep and open its address a minute before you record. Render may also restart a free service at any time. That is safe here, because checks are claimed with a lease and a restart never double-checks a monitor.

Render may suspend a free service that makes an unusually high volume of outbound traffic. The checker makes one small request per monitor per interval, so keep the number of monitors modest.

## 4. Client: Vercel

Import the repository and set:

| Setting | Value |
|---|---|
| Root directory | `client` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Output directory | `dist` |

React Router needs every path to fall back to `index.html`, otherwise refreshing `/dashboard` returns a 404. Add `client/vercel.json` with the rewrites from the option you choose in section 5.

## 5. Cookies: choose one option

The session is an httpOnly cookie. When the client and the API are on different domains the cookie is cross-site. Some browsers (Safari in particular) block cross-site cookies, which breaks login.

**Option A: direct calls (simplest).**
- Client environment variable: `VITE_API_URL=https://YOUR-SERVICE.onrender.com/api`
- `client/vercel.json`:
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```
- Works in Chrome and Edge. May fail in Safari and in browsers that block third-party cookies.

**Option B: proxy through Vercel (recommended).** The browser only talks to the Vercel domain, so the cookie is first-party.
- Client environment variable: `VITE_API_URL=/api`
- `client/vercel.json` (replace the service name):
  ```json
  {
    "rewrites": [
      { "source": "/api/:path*", "destination": "https://YOUR-SERVICE.onrender.com/api/:path*" },
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```
- Requests through the proxy wait for a sleeping Render instance to wake. Keep the instance awake (section 3).
- Set `TRUST_PROXY=2` on Render. The API then sees two proxy hops (Render and Vercel) and reads the visitor's real IP. With the default of `1` every visitor looks like Vercel's IP, so the login limit (10 per 15 minutes) and the status page limit (60 per minute) would be shared by everyone.

## 6. Demo target in production

`NODE_ENV=production` blocks private addresses, so a monitor for `http://localhost:4000` is refused. The blueprint already creates `watchdog-demo-target` as a second free web service. Monitor its public `/health` address and switch it with `/control/down`, `/control/slow` and `/control/up`. Its state is kept in memory, so it returns to up whenever the service restarts or sleeps. Anyone who knows the address can use those links, so treat it as a throwaway demo site.

## 6a. Landing page ticker

The landing page ticker reads a public status page called `world`. After deploying, create it on the production database by running the showcase script with the Atlas connection string (the steps and options are in the README under "Landing page ticker setup"). Sites can answer the production server differently from your own computer, because some block data centre addresses, so check the results for a day before relying on the numbers. To use another link name, set `SHOWCASE_SLUG` for the script and `VITE_SHOWCASE_SLUG` in the Vercel environment variables.

The ticker shows each site's own icon, which the visitor's browser loads from Google's favicon service by default. To use a different service, set `VITE_FAVICON_URL` in Vercel with `{domain}` where the host name goes.

Render sends `SIGTERM` when it redeploys. The server then stops the scheduler, finishes open requests, closes the database connection and exits, so a deploy does not cut a check in half.

CI (`.github/workflows/ci.yml`) runs the tests and the client build on every push. Make sure it is green before you deploy.

## 7. Verification

Run these on the deployed app and note the results in [TESTING.md](./TESTING.md).

- [ ] `/api/health` returns success
- [ ] Register, then refresh the page: still logged in
- [ ] Log out, log in again
- [ ] Add a monitor for a public site: status turns up with a response time
- [ ] Add a monitor for `http://localhost:4000`: refused as a private address
- [ ] Break the demo target: after the failure threshold the monitor goes down and an incident opens
- [ ] Restore it: the incident resolves with a duration
- [ ] Refresh `/dashboard` and `/incidents` directly: no 404
- [ ] The Render logs show one line per request and no repeated errors
- [ ] Publish a status page, then open its link in a private window: it loads without logging in
- [ ] Landing page shows the ticker once the `world` page has at least 5 monitors
- [ ] Render logs show checks running without errors

## 8. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Login works but a refresh logs you out | The cookie is blocked as cross-site. Use option B |
| CORS error in the browser | `CLIENT_URL` does not exactly match the client origin. No trailing slash, correct scheme |
| 404 when refreshing a page on Vercel | `client/vercel.json` rewrite is missing |
| Every monitor stays on Pending | The scheduler is not running: the instance is asleep, or `DISABLE_SCHEDULER` is `true` |
| Server exits at startup | `MONGO_URI` or `JWT_SECRET` is missing, or Atlas Network Access does not allow the host |
| A public monitor shows "Private addresses are not allowed" | The hostname resolves to a private address. That is the protection working |
| A site shows down but loads in a browser | The site blocks bots or datacenter IPs. Add the status it returns (often 403) to the expected status codes |
