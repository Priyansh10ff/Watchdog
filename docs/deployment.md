# Deployment

Plan: MongoDB Atlas for the database, Render for the API, Vercel for the client. All three have free tiers. Nothing here has been deployed yet, so follow the steps in order and tick the verification list at the end.

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

Create a **Web Service** from the GitHub repository.

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

**Keep it awake.** The scheduler runs inside the API process. Free instances sleep after a period without traffic (about 15 minutes, check Render's current terms), and checks stop while it sleeps. Either use an always-on instance, or point an external pinger at `/api/health` every 5 minutes.

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

`NODE_ENV=production` blocks private addresses, so a monitor for `http://localhost:4000` is refused. For the demo video, deploy `demo-target` as a second Render web service (root directory `demo-target`, build `npm install`, start `npm start`) and monitor its public `/health` URL. Switch it with `/control/down`, `/control/slow` and `/control/up`.

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
