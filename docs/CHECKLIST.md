# Readiness checklist

Tick items only after you have verified them yourself. Items marked **(verify)** depend on things outside the code, such as the Git history or the hosting dashboard.

Related: [PRD.md](./PRD.md) · [TECHNICAL.md](./TECHNICAL.md) · [deployment.md](./deployment.md) · [TESTING.md](./TESTING.md)

---

## 1. College submission checklist

- [x] The project is a functional software application (MERN)
- [x] The problem and target user are defined ([PRODUCT.md](./PRODUCT.md), [PRD.md](./PRD.md))
- [ ] Core workflows actually work end to end: run every case in [TESTING.md](./TESTING.md) and fill in the Result column
- [x] The application contains meaningful engineering logic (scheduler with atomic claiming, status machine, incidents, SSRF protection)
- [x] Important failures are handled (timeouts, DNS failures, bad status, duplicate monitors, invalid input, unauthorized access)
- [ ] No secrets or credentials are exposed: confirm no `.env` file is in the Git history **(verify)**
- [ ] Source code is accessible: open the repository in a private window **(verify)**
- [ ] Git history demonstrates development: many small commits with clear messages **(verify)**
- [x] README explains the project
- [x] Technical architecture is documented ([TECHNICAL.md](./TECHNICAL.md))
- [ ] Application is deployed ([deployment.md](./deployment.md))
- [ ] Demo video is recorded and accessible
- [ ] All submitted links work in an incognito window
- [ ] The official submission form is completed before the deadline

Submission form fields: Project Name, Student Name, Problem Statement, GitHub Repository, Deployed Application, Demo Video, Tech Stack, Major Features.

## 2. Features

- [x] Accounts and sessions
- [x] Monitor management, pause, resume, check now
- [x] Scheduled checks with safe claiming
- [x] Status machine and incidents
- [x] Dashboard and incidents page
- [x] Pulse monitor cards, edit monitor page and interval dial with a custom interval
- [x] Public status page (FR14)
- [ ] Response time chart and uptime bar (FR15)
- [ ] Run the interface and status page test cases in [TESTING.md](./TESTING.md)
- [ ] Automated tests (FR20)
- [ ] Rate limit on the rest of the API (FR21)

## 3. Security review

- [x] Passwords hashed with bcrypt, never returned
- [x] Session in an httpOnly cookie, `secure` and `sameSite: none` in production
- [x] Input types validated, ranges enforced
- [x] Every monitor and incident query scoped to the user
- [x] Rate limit on register and login
- [x] `helmet`, restricted CORS, 10 kB body limit
- [x] Private-address blocking in production (DNS, IP literals, redirects)
- [x] Rate limit on the public status page
- [ ] Rate limit on the rest of the API
- [ ] `JWT_SECRET` is a long random value in production **(verify)**
- [ ] Atlas database user has a strong password and only the access it needs **(verify)**
- [ ] `npm audit` reviewed for both `server` and `client`

## 4. Production readiness

- [ ] `NODE_ENV=production` set on the API host
- [ ] `CLIENT_URL` matches the deployed client origin exactly
- [ ] Health check path `/api/health` configured on the host
- [ ] API instance stays awake, or an external ping runs every 5 minutes
- [ ] Cookie approach chosen and tested on Chrome and Safari ([deployment.md](./deployment.md) section 5)
- [ ] `TRUST_PROXY` set to `2` if the Vercel proxy option is used
- [ ] `client/vercel.json` added so direct page refreshes do not return 404
- [ ] Public demo target deployed for the video
- [ ] Logs checked after deploy: `DB Connected`, `Scheduler started`, no repeated errors
- [ ] A monitor on a public site runs for at least one hour without problems

## 5. Accessibility and interface

- [x] Text contrast meets WCAG AA ([DESIGN.md](./DESIGN.md) section 10)
- [x] Visible focus style on every interactive element
- [x] Form and action errors announced to screen readers (`role="alert"`)
- [ ] Page-level loading and error cards announced to screen readers
- [ ] Layout checked at 360 px, tablet and desktop widths
- [ ] Keyboard-only walkthrough: sign up, add a monitor, acknowledge an incident
- [ ] Landing page checked on a phone and a tablet
- [ ] Reduced-motion setting turned on: landing page still reads correctly

## 6. Documentation

- [x] README with problem, features, setup, environment variables, deployment
- [x] [PRODUCT.md](./PRODUCT.md), [PRD.md](./PRD.md), [TECHNICAL.md](./TECHNICAL.md), [DESIGN.md](./DESIGN.md)
- [x] [api.md](./api.md) and [database-schema.md](./database-schema.md)
- [x] [deployment.md](./deployment.md)
- [ ] Screenshots added to `docs/screenshots/` and linked from the README
- [ ] Postman collection exported to `docs/postman/`
- [ ] Live links added to the README after deployment
- [ ] `LICENSE` file has content (it is empty now)

## 7. Demo video (3 to 5 minutes)

Show the product working, not the code.

1. The problem: owners learn about outages from users
2. Who it is for
3. Sign up and add a monitor, show the first live result
4. Show the options: interval, status codes, keyword, failure threshold
5. Break the demo target: watch the failures build, then the monitor goes down and an incident opens
6. Acknowledge the incident
7. Restore the demo target: the incident resolves with its duration
8. The public status page
9. One slide on the architecture: scheduler, atomic claiming, status machine, incidents
10. Close with what is next

- [ ] Recorded
- [ ] Link opens in a private window

## 8. Final steps

1. Run [TESTING.md](./TESTING.md) on the deployed app and save screenshots.
2. Open the repository, the live app and the video in a private window.
3. Re-read the README as if you were an evaluator.
4. Submit the form and keep a copy of what you submitted.
