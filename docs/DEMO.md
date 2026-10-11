# Demo video script

A 4 to 5 minute video that shows the product working. Show the live app, not the code, except for one short architecture moment near the end.

Related: [PRODUCT.md](./PRODUCT.md) · [deployment.md](./deployment.md) · [CHECKLIST.md](./CHECKLIST.md)

---

## Before you record

Do these 15 minutes before, in this order.

1. Make sure the API is awake: open `https://YOUR-API.onrender.com/api/health`. The pinger should keep it awake, but check.
2. Wake the demo site a minute early by opening `https://YOUR-DEMO-TARGET.onrender.com/`. It starts in the up state. Its control links are `/control/down`, `/control/slow` and `/control/up`.
3. Run the live smoke test and read the result. If it passes, the video will work:
   ```bash
   cd server
   npm run smoke -- https://YOUR-APP.vercel.app --demo=https://YOUR-DEMO-TARGET.onrender.com
   ```
4. Log in to your own account in a normal window. Delete old test monitors so the dashboard is clean, then add one real site (for example your portfolio) so there is something to look at.
5. Open these tabs: the landing page, the dashboard, the demo target, and a private window for the public status page.
6. Browser at 1920 by 1080, zoom 110 percent, notifications off, bookmarks bar hidden. Never show the Render or Atlas dashboards or any environment variable.

## Timeline

| Time | Show | Say |
|---|---|---|
| 0:00 | Landing page hero | Watchdog is an uptime and incident tracker. Owners usually hear about an outage from their users. Watchdog checks a site on a schedule and tells you first. The dog, Sentry, shows the state: asleep when everything is up, barking when something is down. |
| 0:30 | Scroll through the story and the yellow ticker | It does not raise an alarm for one dropped request: a site is called down only after several failed checks in a row, and you get one incident per outage. This ticker is real data from checks Watchdog runs on popular sites. |
| 1:00 | Log in, open Add monitor | I add a site by its address. The dial sets how often to check, from every minute to every hour, or any number of minutes. I choose which status codes count as up, so a login-protected site that answers 401 is not a false alarm, and how many failures in a row confirm an outage. |
| 1:40 | Dashboard, the new card | The first check runs straight away. Each card shows the response time, 24 hour uptime and a bar for each recent check. |
| 2:00 | Demo target: press Make it down | Now I break a site on purpose. |
| 2:15 | Dashboard, wait for the card to turn down | After the failure threshold, the card turns red, the page turns red and Sentry barks. One incident opens with the cause and when it started. |
| 2:45 | Incidents page: acknowledge | I acknowledge it to show someone is on it. |
| 3:00 | Demo target: press Make it up, then the dashboard | When the site answers again, the incident resolves itself and records how long the outage lasted. |
| 3:20 | Edit a monitor, pause and resume, delete with the confirmation | A monitor can be edited, paused or deleted. Deleting asks first, inside the page. |
| 3:40 | Status page settings, then the private window | I choose monitors, pick a link and publish. Anyone can open it without logging in. It shows names, status and uptime, never the addresses. |
| 4:05 | A slide or the README architecture diagram | One scheduler claims due monitors with an atomic lease, so a restart or a second server never double-checks. A status machine decides when a site is down. Private network addresses are blocked, so a monitor cannot be pointed at the server's own network. There are 435 server tests and 57 client tests, CI on every push, and it is deployed on Vercel, Render and Atlas. |
| 4:35 | Landing page or the repo | Next: SSL expiry warnings and charts. Thanks for watching. |

## If something goes wrong while recording

- **The first page is slow:** the API was asleep. Stop, load the page once, wait 30 seconds and start again. The pinger prevents this.
- **The card does not turn red quickly:** with the default threshold of 3 and a 1 minute interval, a confirmed outage takes about 2 to 3 minutes. Create the demo monitor with a threshold of 1 before recording and cut the waiting, or say "I will skip ahead".
- **A site shows down for the wrong reason:** some sites block checks from data centres. Use your own portfolio and the demo target, not big brand sites.

## After recording

1. Export at 1080p. Upload as unlisted on YouTube, or share a Drive link set to anyone with the link.
2. Open the link in a private window, with sound, to prove it plays.
3. Put the link in the README and in the submission form.

## Submission form, ready to paste

Check these against the form's own wording.

- **Project name:** Watchdog
- **Student name:** Priyansh Dugar
- **Problem statement:** Website owners usually learn about an outage from their users. Simple monitors raise false alarms on one dropped request and keep alerting during a long outage, and they cannot handle sites that answer 401 or redirect. Watchdog checks sites on a schedule, calls a site down only after several failed checks in a row, opens one incident per outage and closes it automatically on recovery, and publishes a public status page.
- **GitHub repository:** your repository link
- **Deployed application:** your Vercel address
- **Demo video:** your video link
- **Tech stack:** MongoDB, Express, React, Node.js. Vite, Tailwind CSS, GSAP, node-cron, JWT in an httpOnly cookie. Deployed on Vercel, Render and MongoDB Atlas.
- **Major features:** scheduled checks with per-monitor interval, status codes, keyword and failure threshold; incidents with acknowledge and automatic resolution; a live dashboard with response time, uptime and recent checks; a public status page; SSRF protection, rate limits and security headers; 435 server tests, 57 client tests and CI.
