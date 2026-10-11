const argv = process.argv.slice(2);

const option = (name) => {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
};

const base = (argv.find((arg) => /^https?:\/\//.test(arg)) || process.env.SMOKE_BASE_URL || "").replace(/\/+$/, "");
const target = option("target") || process.env.SMOKE_TARGET || "https://example.com";
const demo = (option("demo") || process.env.SMOKE_DEMO_URL || "").replace(/\/+$/, "");
const fromEnv = (name, fallback) => {
  const value = process.env[name];
  return value !== undefined && value !== "" && !Number.isNaN(Number(value)) ? Number(value) : fallback;
};

const cooldownMs = fromEnv("SMOKE_COOLDOWN_MS", 11000);
const firstCheckTimeoutMs = fromEnv("SMOKE_CHECK_TIMEOUT_MS", 150000);
const incidentTimeoutMs = fromEnv("SMOKE_INCIDENT_TIMEOUT_MS", 240000);

if (!base) {
  console.log(`Usage: node scripts/smokeTest.mjs <address> [--target=<site to monitor>] [--demo=<demo target address>]

  <address>   where the app is deployed, for example https://your-app.vercel.app
              (the checks go through /api, so use the address people open)
  --target    a public site the test monitors. Default: https://example.com
  --demo      the address of watchdog-demo-target. Adds a full outage and recovery test.`);
  process.exit(1);
}

const isHttps = base.startsWith("https://");
const marks = { ok: "[ ok ]", warn: "[warn]", fail: "[FAIL]" };
const results = [];
const created = { monitors: [], slug: null };
const session = { cookie: null, email: null };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const record = (state, name, detail = "") => {
  results.push({ state, name, detail });
  console.log(`${marks[state]} ${name}${detail ? `  ${detail}` : ""}`);
};

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const check = async (name, fn) => {
  try {
    const outcome = await fn();

    if (outcome && typeof outcome === "object" && outcome.warn) record("warn", name, outcome.warn);
    else record("ok", name, typeof outcome === "string" ? outcome : "");

    return true;
  } catch (error) {
    record("fail", name, error.name === "TimeoutError" ? "no answer in time" : error.message);
    return false;
  }
};

const api = async (method, path, { body, cookie, headers = {}, timeout = 45000, rawBody } = {}) => {
  const started = Date.now();
  const hasBody = body !== undefined || rawBody !== undefined;

  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    redirect: "manual",
    signal: AbortSignal.timeout(timeout),
  });

  const text = await response.text();
  let json = null;

  try {
    json = JSON.parse(text);
  } catch (error) {
    json = null;
  }

  return { status: response.status, headers: response.headers, json, text, ms: Date.now() - started };
};

const authed = (method, path, body, extra = {}) => api(method, path, { body, cookie: session.cookie, ...extra });

const waitFor = async (fn, timeout, every = 4000) => {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    const value = await fn();

    if (value) return { value, seconds: Math.round((Date.now() - started) / 1000) };

    await sleep(every);
  }

  return null;
};

const findMonitor = async (id) => {
  const res = await authed("GET", "/api/monitors");
  return res.json?.monitors?.find((monitor) => monitor._id === id);
};

const hostOf = (url) => new URL(url).hostname.replace(/^www\./, "");

const createMonitor = async (data) => {
  const res = await authed("POST", "/api/monitors", data);

  expect(res.status === 201, `expected 201, got ${res.status}: ${res.json?.message || res.text.slice(0, 80)}`);
  created.monitors.push(res.json.monitor._id);

  return res.json.monitor;
};

const run = async () => {
  console.log(`Smoke test for ${base}`);
  console.log(`Monitored site: ${target}${demo ? `, demo target: ${demo}` : ""}\n`);

  await check("API answers the health check", async () => {
    const res = await api("GET", "/api/health", { timeout: 90000 });

    expect(res.status === 200 && res.json?.success === true, `expected a healthy answer, got ${res.status}`);

    return res.ms > 15000 ? { warn: `answered after ${Math.round(res.ms / 1000)} s: the server had been asleep, so set up the pinger` } : `${res.ms} ms`;
  });

  await check("Security headers are on", async () => {
    const { headers } = await api("GET", "/api/health");

    expect(headers.get("x-content-type-options") === "nosniff", "x-content-type-options is missing");
    expect(!headers.get("x-powered-by"), "x-powered-by reveals the framework");

    if (isHttps && !headers.get("strict-transport-security")) return { warn: "no strict-transport-security header" };
  });

  await check("Unknown routes answer with a JSON 404 and rate limit headers", async () => {
    const res = await api("GET", "/api/definitely-not-a-route");

    expect(res.status === 404 && res.json?.message === "Route not found", `expected a JSON 404, got ${res.status}`);

    if (!res.headers.get("x-ratelimit-limit") && !res.headers.get("ratelimit-limit")) {
      return { warn: "no rate limit headers (a proxy may remove them)" };
    }
  });

  await check("Invalid JSON gets a clean 400", async () => {
    const res = await api("POST", "/api/auth/login", { rawBody: "{bad json" });

    expect(res.status === 400 && res.json?.message === "Invalid JSON", `expected 400 Invalid JSON, got ${res.status}`);
  });

  await check("Another website is not allowed by CORS", async () => {
    const res = await api("OPTIONS", "/api/monitors", {
      headers: { Origin: "https://evil.example.com", "Access-Control-Request-Method": "GET" },
    });
    const allowed = res.headers.get("access-control-allow-origin");

    expect(allowed !== "https://evil.example.com" && allowed !== "*", `the evil origin was allowed (${allowed})`);
  });

  await check("Protected routes refuse a visitor without a session", async () => {
    const res = await api("GET", "/api/monitors");

    expect(res.status === 401, `expected 401, got ${res.status}`);
  });

  session.email = `smoke-${Date.now().toString(36)}@watchdog.test`;
  const password = `Smoke-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

  const registered = await check("Registering creates an account and a secure session cookie", async () => {
    const res = await api("POST", "/api/auth/register", { body: { name: "Smoke Test", email: session.email, password } });

    expect(res.status === 201, `expected 201, got ${res.status}: ${res.json?.message || res.text.slice(0, 80)}`);
    expect(res.json?.user && !("password" in res.json.user), "the answer contains the password hash");

    const setCookies = res.headers.getSetCookie?.() || [];
    const raw = setCookies.find((cookie) => cookie.startsWith("token="));

    expect(raw, "no session cookie was set");

    const lower = raw.toLowerCase();

    expect(lower.includes("httponly"), "the cookie is readable by page scripts (no HttpOnly)");
    if (isHttps) expect(lower.includes("secure"), "the cookie is not marked Secure");

    session.cookie = raw.split(";")[0];

    const sameSite = (lower.match(/samesite=(\w+)/) || [])[1] || "not set";

    if (sameSite === "none" && isHttps) {
      return { warn: "SameSite=None. That is right for a direct Render address. Behind the Vercel proxy set COOKIE_SAMESITE=lax" };
    }

    return `HttpOnly, ${isHttps ? "Secure, " : ""}SameSite=${sameSite}`;
  });

  if (registered) {
    await check("The session works", async () => {
      const res = await authed("GET", "/api/auth/me");

      expect(res.status === 200 && res.json?.user?.email === session.email, `expected the account, got ${res.status}`);
    });

    await check("Private and local addresses are refused", async () => {
      const res = await authed("POST", "/api/monitors", { name: "Private", url: "http://127.0.0.1:5000" });

      if (res.status === 201) {
        created.monitors.push(res.json.monitor._id);
        return { warn: "accepted 127.0.0.1. NODE_ENV is probably not production, so the protection is off" };
      }

      expect(res.status === 400 && /private/i.test(res.json?.message || ""), `expected 400, got ${res.status}`);
    });

    let monitor = null;

    const made = await check("A monitor can be created", async () => {
      monitor = await createMonitor({ name: "Smoke monitor", url: target, intervalMinutes: 1, failureThreshold: 1, timeoutMs: 10000 });

      return monitor._id;
    });

    if (made) {
      await check("The server checks it by itself (scheduler and outbound network)", async () => {
        const found = await waitFor(async () => {
          const current = await findMonitor(monitor._id);
          return current?.lastCheckedAt ? current : null;
        }, firstCheckTimeoutMs);

        expect(found, `no check in ${Math.round(firstCheckTimeoutMs / 1000)} s. Is the server asleep, or is DISABLE_SCHEDULER set?`);
        expect(found.value.status === "up", `the monitor is ${found.value.status}. ${target} may block the checker`);

        return `up in ${found.value.lastResponseTimeMs} ms, first check after ${found.seconds} s`;
      });

      await check("Results and 24 hour statistics are returned", async () => {
        const res = await authed("GET", `/api/monitors/${monitor._id}/results`);

        expect(res.status === 200 && res.json.results.length >= 1, "no stored check results");
        expect(res.json.last24h.checks >= 1 && typeof res.json.last24h.uptimePercent === "number", "no 24 hour statistics");

        return `${res.json.results.length} check(s), uptime ${res.json.last24h.uptimePercent}%`;
      });

      await check("The list carries recent checks and uptime for the dashboard cards", async () => {
        const current = await findMonitor(monitor._id);

        expect(Array.isArray(current?.recentChecks) && current.recentChecks.length >= 1, "recentChecks is missing");
        expect(typeof current.uptime24h === "number", "uptime24h is missing");
      });

      await check("Editing changes the name and interval but never the address", async () => {
        const res = await authed("PATCH", `/api/monitors/${monitor._id}`, { name: "Smoke monitor (edited)", intervalMinutes: 5, url: "https://evil.example.com" });

        expect(res.status === 200, `expected 200, got ${res.status}`);
        expect(res.json.monitor.name === "Smoke monitor (edited)" && res.json.monitor.intervalMinutes === 5, "the change was not saved");
        expect(res.json.monitor.url === monitor.url, "the address was changed");
      });

      await check("Pausing and resuming work", async () => {
        const paused = await authed("PATCH", `/api/monitors/${monitor._id}/toggle`);
        const resumed = await authed("PATCH", `/api/monitors/${monitor._id}/toggle`);

        expect(paused.json?.message === "Monitor paused" && resumed.json?.message === "Monitor resumed", "toggle did not alternate");
      });

      await check("Check now works after the cooldown", async () => {
        await sleep(cooldownMs);
        const res = await authed("POST", `/api/monitors/${monitor._id}/check`, undefined, { timeout: 60000 });

        expect(res.status === 200 && res.json?.result?.isUp === true, `expected a passing check, got ${res.status}: ${res.json?.message || ""}`);
      });

      await check("The incident list answers", async () => {
        const res = await authed("GET", "/api/incidents?status=active");

        expect(res.status === 200 && Array.isArray(res.json?.incidents), `expected a list, got ${res.status}`);
      });

      created.slug = `smoke-${Math.random().toString(36).slice(2, 8)}`;

      await check("A status page can be published and read without logging in", async () => {
        const saved = await authed("PUT", "/api/status-page", {
          slug: created.slug,
          title: "Smoke test page",
          monitors: [monitor._id],
          isPublished: true,
          showDomains: true,
        });

        expect(saved.status === 200, `expected 200, got ${saved.status}: ${saved.json?.message || ""}`);

        const page = await api("GET", `/api/status/${created.slug}`);

        expect(page.status === 200 && page.json?.page?.title === "Smoke test page", `the public page answered ${page.status}`);
        expect(page.json.monitors.length === 1 && page.json.monitors[0].status === "up", "the monitor is missing or not up");
        expect(page.json.monitors[0].domain === hostOf(target), `expected the domain ${hostOf(target)}, got ${page.json.monitors[0].domain}`);
        expect(!page.text.includes(target) && !("url" in page.json.monitors[0]), "the public page exposes the full address");

        return `shows ${page.json.monitors[0].domain}, no full address`;
      });

      await check("Hiding the page makes it answer 404, and deleting removes it", async () => {
        const hidden = await authed("PUT", "/api/status-page", { slug: created.slug, title: "Smoke test page", monitors: [monitor._id], isPublished: false });
        const gone = await api("GET", `/api/status/${created.slug}`);
        const removed = await authed("DELETE", "/api/status-page");

        expect(hidden.status === 200 && gone.status === 404, `a hidden page answered ${gone.status}`);
        expect(removed.status === 200, `delete answered ${removed.status}`);
        created.slug = null;
      });
    }

    if (demo) {
      console.log("\nOutage and recovery with the demo target (this takes a few minutes)");

      let demoMonitor = null;

      await check("The demo site wakes up and starts in the up state", async () => {
        const res = await fetch(`${demo}/control/up`, { signal: AbortSignal.timeout(120000) });

        expect(res.status === 200, `expected 200, got ${res.status}`);
      });

      const ready = await check("A monitor for the demo site becomes up", async () => {
        demoMonitor = await createMonitor({ name: "Smoke demo", url: `${demo}/health`, intervalMinutes: 1, failureThreshold: 1, timeoutMs: 15000 });

        const found = await waitFor(async () => {
          const current = await findMonitor(demoMonitor._id);
          return current?.status === "up" ? current : null;
        }, firstCheckTimeoutMs);

        expect(found, "the demo monitor never became up");

        return `up after ${found.seconds} s`;
      });

      if (ready) {
        let incident = null;

        const opened = await check("Breaking the demo site opens exactly one incident", async () => {
          await fetch(`${demo}/control/down`, { signal: AbortSignal.timeout(60000) });

          const found = await waitFor(async () => {
            const res = await authed("GET", "/api/incidents?status=active");
            const matches = (res.json?.incidents || []).filter((item) => item.monitor?._id === demoMonitor._id);
            return matches.length ? matches : null;
          }, incidentTimeoutMs, 6000);

          expect(found, `no incident opened within ${Math.round(incidentTimeoutMs / 1000)} s`);
          expect(found.value.length === 1, `${found.value.length} incidents opened for one outage`);

          incident = found.value[0];

          return `opened after ${found.seconds} s: ${incident.cause?.errorMessage || "failing"}`;
        });

        if (opened) {
          await check("The incident can be acknowledged", async () => {
            const res = await authed("PATCH", `/api/incidents/${incident._id}/acknowledge`);

            expect(res.status === 200 && res.json.incident.status === "acknowledged", `expected acknowledged, got ${res.status}`);
          });

          await check("Restoring the demo site resolves the incident with its duration", async () => {
            await fetch(`${demo}/control/up`, { signal: AbortSignal.timeout(60000) });

            const found = await waitFor(async () => {
              const res = await authed("GET", `/api/incidents/${incident._id}`);
              return res.json?.incident?.status === "resolved" ? res.json.incident : null;
            }, incidentTimeoutMs, 6000);

            expect(found, `the incident was not resolved within ${Math.round(incidentTimeoutMs / 1000)} s`);
            expect(found.value.durationMs >= 0, "no duration was stored");

            return `resolved after ${found.seconds} s, it lasted ${Math.round(found.value.durationMs / 1000)} s`;
          });
        }
      }

      await fetch(`${demo}/control/up`, { signal: AbortSignal.timeout(60000) }).catch(() => {});
    }
  }
};

const cleanup = async () => {
  if (!session.cookie) return;

  let removed = 0;

  for (const id of created.monitors) {
    const res = await authed("DELETE", `/api/monitors/${id}`).catch(() => null);
    if (res?.status === 200) removed += 1;
  }

  if (created.slug) await authed("DELETE", "/api/status-page").catch(() => null);

  const out = await authed("POST", "/api/auth/logout").catch(() => null);

  console.log(`\nCleaned up: ${removed} monitor(s) deleted, ${out?.status === 200 ? "logged out" : "logout failed"}.`);
  console.log(`The test account ${session.email} stays in the database. There is no delete-account route, so remove it in Atlas if you like.`);
};

try {
  await run();
} catch (error) {
  record("fail", "The test stopped unexpectedly", error.message);
} finally {
  await cleanup();
}

const count = (state) => results.filter((item) => item.state === state).length;

console.log(`\n${count("ok")} passed, ${count("warn")} warning(s), ${count("fail")} failed`);

if (count("fail") > 0) {
  console.log("\nFailed:");
  results.filter((item) => item.state === "fail").forEach((item) => console.log(`  - ${item.name}: ${item.detail}`));
}

process.exit(count("fail") > 0 ? 1 : 0);
