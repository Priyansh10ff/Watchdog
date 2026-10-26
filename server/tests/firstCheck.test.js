import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import { checkSoonAndWait } from "../services/checker.service.js";
import Monitor from "../models/monitor.model.js";
import { installMemoryApp } from "./helpers/memoryApp.js";
import { startTestServer } from "./helpers/server.js";
import { cookieFor, oid, quiet, stub } from "./helpers/stubs.js";

const { default: app } = await import("../app.js");

let server;
let base;
let target;
let memory;
let user;

const create = async (body) => {
  const response = await fetch(`${base}/api/monitors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookieFor(user._id) },
    body: JSON.stringify(body),
  });

  return { status: response.status, json: await response.json() };
};

before(async () => {
  target = await startTestServer();
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await target.close();
});

beforeEach(async () => {
  memory = installMemoryApp();
  user = await User.create({ name: "Tester", email: "t@example.com", password: "x" });
});

afterEach(() => memory.restore());

describe("the first check of a new monitor", () => {
  it("is finished before the answer comes back, so the card is complete at once", async () => {
    const { status, json } = await create({ name: "Shop", url: `${target.base}/ok`, intervalMinutes: 5 });

    assert.equal(status, 201);
    assert.equal(json.monitor.status, "up");
    assert.equal(typeof json.monitor.lastResponseTimeMs, "number");
    assert.ok(json.monitor.lastCheckedAt, "no check time");
    assert.equal(json.monitor.recentChecks.length, 1);
    assert.equal(json.monitor.recentChecks[0].isUp, true);
    assert.equal(json.monitor.uptime24h, 100);
  });

  it("reports a site that is down, with the same shape", async () => {
    const { status, json } = await create({ name: "Broken", url: `${target.base}/error`, intervalMinutes: 5, failureThreshold: 2 });

    assert.equal(status, 201);
    assert.equal(json.monitor.status, "unknown", "one failure is below the threshold");
    assert.equal(json.monitor.consecutiveFailures, 1);
    assert.equal(json.monitor.recentChecks.length, 1);
    assert.equal(json.monitor.recentChecks[0].isUp, false);
    assert.equal(json.monitor.uptime24h, 0);
  });

  it("stores the check, so the dashboard shows the same thing", async () => {
    await create({ name: "Shop", url: `${target.base}/ok`, intervalMinutes: 5 });

    assert.equal(memory.db.results.length, 1);
    assert.equal(memory.db.results[0].isUp, true);

    const response = await fetch(`${base}/api/monitors`, { headers: { Cookie: cookieFor(user._id) } });
    const { monitors } = await response.json();

    assert.equal(monitors[0].status, "up");
    assert.equal(monitors[0].recentChecks.length, 1);
  });

  it("never returns the encrypted headers", async () => {
    const { json } = await create({ name: "Shop", url: `${target.base}/ok` });

    assert.equal("encryptedHeaders" in json.monitor, false);
  });

  it("does not wait for a slow site: it answers promptly with no result yet", async () => {
    const started = Date.now();
    const { status, json } = await create({ name: "Slow", url: `${target.base}/hang`, timeoutMs: 30000, intervalMinutes: 5 });
    const took = Date.now() - started;

    assert.equal(status, 201);
    assert.ok(took < 6000, `took ${took} ms`);
    assert.equal(json.monitor.status, "unknown");
    assert.equal(json.monitor.lastCheckedAt, undefined);
    assert.deepEqual(json.monitor.recentChecks, []);
    assert.equal(json.monitor.uptime24h, null);
  });

  it("still creates the monitor when the check itself fails", async () => {
    const restore = stub(Monitor, "findOneAndUpdate", async () => {
      throw new Error("database is down");
    });

    try {
      const { status, json } = await quiet(() => create({ name: "Shop", url: `${target.base}/ok` }));

      assert.equal(status, 201);
      assert.equal(json.monitor.name, "Shop");
      assert.equal(json.monitor.status, "unknown");
    } finally {
      restore();
    }
  });

  it("checks the monitor only once", async () => {
    await create({ name: "Shop", url: `${target.base}/ok`, intervalMinutes: 5 });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(memory.db.results.length, 1);
  });

  it("schedules the next check by the interval, not immediately", async () => {
    const { json } = await create({ name: "Shop", url: `${target.base}/ok`, intervalMinutes: 5 });
    const next = new Date(json.monitor.nextCheckAt).getTime() - Date.now();

    assert.ok(next > 4 * 60000 && next <= 5 * 60000 + 1000, `next check in ${Math.round(next / 1000)} s`);
  });
});

describe("checkSoonAndWait", () => {
  it("returns the checked monitor when the check finishes in time", async () => {
    const monitor = await Monitor.create({
      user: user._id, name: "Shop", url: `${target.base}/ok`, method: "GET", intervalMinutes: 5,
      timeoutMs: 5000, expectedStatusCodes: [200], keyword: "", failureThreshold: 3,
      isActive: true, status: "unknown", consecutiveFailures: 0, nextCheckAt: new Date(),
    });

    const result = await checkSoonAndWait(monitor._id);

    assert.ok(result, "no monitor returned");
    assert.equal(result.status, "up");
  });

  it("gives up waiting and returns nothing, but the check keeps going in the background", async () => {
    const monitor = await Monitor.create({
      user: user._id, name: "Slow", url: `${target.base}/hang`, method: "GET", intervalMinutes: 5,
      timeoutMs: 700, expectedStatusCodes: [200], keyword: "", failureThreshold: 3,
      isActive: true, status: "unknown", consecutiveFailures: 0, nextCheckAt: new Date(),
    });

    const result = await checkSoonAndWait(monitor._id, 100);

    assert.equal(result, null);
    assert.equal(memory.db.results.length, 0, "it waited for the check after all");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    assert.equal(memory.db.results.length, 1, "the background check never finished");
    assert.equal(memory.db.results[0].isUp, false);
    assert.equal(memory.db.results[0].errorMessage, "Timed out after 700 ms");
  });

  it("returns nothing when the monitor cannot be claimed", async () => {
    const restore = stub(Monitor, "findOneAndUpdate", async () => null);

    try {
      assert.equal(await checkSoonAndWait(oid(), 200), null);
    } finally {
      restore();
    }
  });
});
