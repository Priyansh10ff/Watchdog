import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runCheck } from "../services/checker.service.js";
import { freePort, startTestServer } from "./helpers/server.js";

let server;
const originalEnv = process.env.NODE_ENV;

const monitor = (path, extra = {}) => ({
  url: `${server.base}${path}`,
  method: "GET",
  timeoutMs: 2000,
  expectedStatusCodes: [200],
  keyword: "",
  ...extra,
});

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => server.reset());

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("runCheck: what counts as up", () => {
  it("passes on the expected status and reports the status and a response time", async () => {
    const result = await runCheck(monitor("/ok"));

    assert.equal(result.isUp, true);
    assert.equal(result.statusCode, 200);
    assert.equal(result.errorMessage, "");
    assert.equal(typeof result.responseTimeMs, "number");
    assert.ok(result.responseTimeMs >= 0);
  });

  it("fails on an unexpected status and says which one", async () => {
    const result = await runCheck(monitor("/error"));

    assert.equal(result.isUp, false);
    assert.equal(result.statusCode, 500);
    assert.equal(result.errorMessage, "Unexpected status 500");
    assert.equal(typeof result.responseTimeMs, "number");
  });

  it("treats 404 as down by default", async () => {
    const result = await runCheck(monitor("/missing"));

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Unexpected status 404");
  });

  it("accepts any status in the expected list", async () => {
    assert.equal((await runCheck(monitor("/missing", { expectedStatusCodes: [200, 404] }))).isUp, true);
    assert.equal((await runCheck(monitor("/created", { expectedStatusCodes: [201] }))).isUp, true);
  });

  it("lets a login-protected site count as up when 401 and 403 are expected", async () => {
    assert.equal((await runCheck(monitor("/unauthorized", { expectedStatusCodes: [401, 403] }))).isUp, true);
    assert.equal((await runCheck(monitor("/forbidden", { expectedStatusCodes: [401, 403] }))).isUp, true);
  });

  it("does not accept 200 when only 404 is expected", async () => {
    const result = await runCheck(monitor("/ok", { expectedStatusCodes: [404] }));

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Unexpected status 200");
  });

  it("falls back to 200 when the expected list is empty or missing", async () => {
    assert.equal((await runCheck(monitor("/ok", { expectedStatusCodes: [] }))).isUp, true);
    assert.equal((await runCheck(monitor("/ok", { expectedStatusCodes: undefined }))).isUp, true);
    assert.equal((await runCheck(monitor("/error", { expectedStatusCodes: [] }))).isUp, false);
  });

  it("works with the HEAD method", async () => {
    const result = await runCheck(monitor("/ok", { method: "HEAD" }));

    assert.equal(result.isUp, true);
    assert.equal(result.statusCode, 200);
  });

  it("identifies itself as WatchdogBot", async () => {
    const result = await runCheck(monitor("/ua", { keyword: "WatchdogBot/1.0 (uptime monitoring)" }));

    assert.equal(result.isUp, true);
  });

  it("measures the real response time", async () => {
    const result = await runCheck(monitor("/slow"));

    assert.equal(result.isUp, true);
    assert.ok(result.responseTimeMs >= 500, `expected at least 500 ms, got ${result.responseTimeMs}`);
    assert.ok(result.responseTimeMs < 1500);
  });
});

describe("runCheck: keyword", () => {
  it("passes when the page contains the keyword", async () => {
    assert.equal((await runCheck(monitor("/ok", { keyword: "Welcome" }))).isUp, true);
  });

  it("fails with a clear message when the keyword is missing, even on a 200", async () => {
    const result = await runCheck(monitor("/ok", { keyword: "Dashboard" }));

    assert.equal(result.isUp, false);
    assert.equal(result.statusCode, 200);
    assert.equal(result.errorMessage, "Keyword not found");
  });

  it("is case sensitive", async () => {
    assert.equal((await runCheck(monitor("/ok", { keyword: "welcome" }))).isUp, false);
  });

  it("checks the status before the keyword", async () => {
    const result = await runCheck(monitor("/error", { keyword: "boom" }));

    assert.equal(result.errorMessage, "Unexpected status 500");
  });
});

describe("runCheck: redirects", () => {
  it("follows a redirect that is not expected and judges the final page", async () => {
    const result = await runCheck(monitor("/redirect"));

    assert.equal(result.isUp, true);
    assert.equal(result.statusCode, 200);
    assert.deepEqual(server.state.paths, ["/redirect", "/redirect", "/ok"]);
  });

  it("judges the redirect itself when its status is expected", async () => {
    const result = await runCheck(monitor("/redirect", { expectedStatusCodes: [302] }));

    assert.equal(result.isUp, true);
    assert.equal(result.statusCode, 302);
    assert.deepEqual(server.state.paths, ["/redirect"]);
  });

  it("accepts a 301 when 301 is expected", async () => {
    const result = await runCheck(monitor("/redirect301", { expectedStatusCodes: [200, 301] }));

    assert.equal(result.statusCode, 301);
    assert.equal(result.isUp, true);
  });

  it("fails when the redirect lands on a missing page", async () => {
    const result = await runCheck(monitor("/redirect-missing"));

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Unexpected status 404");
  });

  it("follows up to three redirects", async () => {
    const result = await runCheck(monitor("/hop1"));

    assert.equal(result.isUp, true);
    assert.equal(result.statusCode, 200);
  });

  it("gives up after more than three redirects", async () => {
    const result = await runCheck(monitor("/hop4"));

    assert.equal(result.isUp, false);
    assert.match(result.errorMessage, /redirect/i);
  });

  it("does not loop forever on a redirect loop", async () => {
    const result = await runCheck(monitor("/loop"));

    assert.equal(result.isUp, false);
    assert.match(result.errorMessage, /redirect/i);
    assert.ok(server.state.hits <= 10);
  });

  it("treats a redirect without a location as an unexpected status", async () => {
    const result = await runCheck(monitor("/redirect-no-location"));

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Unexpected status 302");
  });
});

describe("runCheck: failures are described and never thrown", () => {
  it("reports a timeout with the configured limit", async () => {
    const result = await runCheck(monitor("/hang", { timeoutMs: 150 }));

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Timed out after 150 ms");
    assert.equal(result.statusCode, undefined);
    assert.equal(result.responseTimeMs, undefined);
  });

  it("times out a slow answer", async () => {
    const result = await runCheck(monitor("/slow", { timeoutMs: 150 }));

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Timed out after 150 ms");
  });

  it("reports a refused connection", async () => {
    const port = await freePort();
    const result = await runCheck({ ...monitor("/ok"), url: `http://127.0.0.1:${port}/` });

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Connection refused");
  });

  it("reports a connection that is reset", async () => {
    const result = await runCheck(monitor("/reset"));

    assert.equal(result.isUp, false);
    assert.match(result.errorMessage, /reset|hang up|closed/i);
  });

  it("reports a name that does not resolve", async () => {
    const result = await runCheck({ ...monitor("/ok"), url: "http://no-such-host.invalid/" });

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "DNS lookup failed");
  });

  it("rejects a response larger than 2 MB", async () => {
    const result = await runCheck(monitor("/big"));

    assert.equal(result.isUp, false);
    assert.equal(result.statusCode, undefined);
  });

  it("returns a result for a URL that cannot be parsed instead of throwing", async () => {
    const result = await runCheck({ ...monitor("/ok"), url: "::::" });

    assert.equal(result.isUp, false);
    assert.equal(result.errorMessage, "Invalid URL");
  });
});

describe("runCheck: private addresses in production", () => {
  const blocked = ["127.0.0.1", "localhost", "[::1]", "[::ffff:7f00:1]", "[::ffff:127.0.0.1]", "[fd00::1]", "[fe80::1]", "10.0.0.1", "192.168.1.1", "172.16.5.5", "169.254.169.254", "0.0.0.0"];

  for (const host of blocked) {
    it(`refuses ${host} without connecting`, async () => {
      process.env.NODE_ENV = "production";

      const result = await runCheck({ ...monitor("/ok"), url: `http://${host}:${server.port}/ok` });

      assert.equal(result.isUp, false);
      assert.equal(result.errorMessage, "Private addresses are not allowed");
      assert.equal(server.state.hits, 0);
    });
  }

  it("still allows local addresses outside production, for the demo target", async () => {
    process.env.NODE_ENV = "development";

    const result = await runCheck({ ...monitor("/ok"), url: `http://localhost:${server.port}/ok` });

    assert.equal(result.isUp, true);
  });

  it("does not treat a public address as private", async () => {
    process.env.NODE_ENV = "production";

    const result = await runCheck({ ...monitor("/ok"), url: "http://203.0.113.9:81/", timeoutMs: 300 });

    assert.notEqual(result.errorMessage, "Private addresses are not allowed");
  });
});
