import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Monitor from "../models/monitor.model.js";
import { checkSoon, claimDueMonitors, claimMonitor, processMonitor } from "../services/checker.service.js";
import { oid, quiet, stub } from "./helpers/stubs.js";
import { useMemoryStores } from "./helpers/memory.js";
import { startTestServer } from "./helpers/server.js";

let server;
let memory;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const monitorDoc = (extra = {}) => {
  const doc = {
    _id: oid(),
    user: oid(),
    url: `${server.base}/ok`,
    method: "GET",
    timeoutMs: 2000,
    expectedStatusCodes: [200],
    keyword: "",
    failureThreshold: 2,
    intervalMinutes: 5,
    status: "unknown",
    consecutiveFailures: 0,
    saves: 0,
    ...extra,
  };

  doc.save = async () => {
    doc.saves += 1;
  };

  return doc;
};

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  memory = useMemoryStores();
});

afterEach(() => memory.restore());

describe("processMonitor", () => {
  it("runs the check, records the result and saves the monitor", async () => {
    const monitor = monitorDoc();

    const outcome = await processMonitor(monitor);

    assert.equal(outcome.result.isUp, true);
    assert.equal(outcome.transition, null);
    assert.equal(outcome.incidentEvent, null);
    assert.equal(monitor.status, "up");
    assert.equal(monitor.saves, 1);
    assert.equal(memory.store.results.length, 1);

    const stored = memory.store.results[0];

    assert.equal(String(stored.monitor), String(monitor._id));
    assert.equal(stored.isUp, true);
    assert.equal(stored.statusCode, 200);
    assert.equal(stored.checkedAt.getTime(), monitor.lastCheckedAt.getTime());
  });

  it("goes through a whole outage: blip, down, incident, updates and recovery", async () => {
    const monitor = monitorDoc({ failureThreshold: 2 });

    await processMonitor(monitor);
    await sleep(5);

    monitor.url = `${server.base}/error`;
    const blip = await processMonitor(monitor);
    await sleep(5);

    assert.equal(blip.transition, null);
    assert.equal(blip.incidentEvent, null);
    assert.equal(monitor.status, "up");
    assert.equal(memory.store.incidents.length, 0);
    assert.ok(monitor.nextCheckAt.getTime() - Date.now() <= 60000);

    const opened = await processMonitor(monitor);
    await sleep(5);

    assert.equal(opened.transition, "down");
    assert.equal(opened.incidentEvent, "opened");
    assert.equal(monitor.status, "down");
    assert.equal(opened.incident.cause.statusCode, 500);
    assert.equal(opened.incident.cause.errorMessage, "Unexpected status 500");

    const firstFailure = memory.store.results.filter((row) => !row.isUp)[0];
    assert.equal(opened.incident.startedAt.getTime(), firstFailure.checkedAt.getTime());

    const updated = await processMonitor(monitor);
    await sleep(5);

    assert.equal(updated.incidentEvent, "updated");
    assert.equal(memory.store.incidents.length, 1);
    assert.equal(memory.store.incidents[0].failedChecks, 3);

    monitor.url = `${server.base}/ok`;
    const recovered = await processMonitor(monitor);

    assert.equal(recovered.transition, "recovered");
    assert.equal(recovered.incidentEvent, "resolved");
    assert.equal(monitor.status, "up");
    assert.equal(recovered.incident.isResolved, true);
    assert.ok(recovered.incident.durationMs >= 0);
    assert.ok(monitor.nextCheckAt.getTime() - Date.now() > 4 * 60000);
    assert.equal(memory.store.results.length, 5);
    assert.equal(monitor.saves, 5);
  });

  it("records a failed check that had no response at all", async () => {
    const monitor = monitorDoc({ url: `${server.base}/hang`, timeoutMs: 150 });

    const outcome = await processMonitor(monitor);

    assert.equal(outcome.result.isUp, false);
    assert.equal(memory.store.results[0].errorMessage, "Timed out after 150 ms");
    assert.equal(monitor.lastResponseTimeMs, undefined);
  });
});

describe("claiming monitors", () => {
  let restoreFind;
  let calls;

  const queue = (docs) => {
    calls = [];
    restoreFind = stub(Monitor, "findOneAndUpdate", async (filter, update, options) => {
      calls.push({ filter, update, options });
      return docs.shift() || null;
    });
  };

  afterEach(() => restoreFind && restoreFind());

  it("claims due monitors one at a time until none are left", async () => {
    queue([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const claimed = await claimDueMonitors(100);

    assert.deepEqual(claimed, [{ id: 1 }, { id: 2 }, { id: 3 }]);
    assert.equal(calls.length, 4);
  });

  it("asks only for active monitors that are due, oldest first, and leases them for two minutes", async () => {
    queue([{ id: 1 }]);
    const before = Date.now();

    await claimDueMonitors(5);

    const { filter, update, options } = calls[0];

    assert.equal(filter.isActive, true);
    assert.ok(filter.nextCheckAt.$lte.getTime() >= before - 1);
    assert.deepEqual(options.sort, { nextCheckAt: 1 });
    assert.equal(options.returnDocument, "after");

    const lease = update.$set.nextCheckAt.getTime() - before;

    assert.ok(lease >= 119000 && lease <= 121000, `lease was ${lease} ms`);
  });

  it("stops at the limit", async () => {
    queue(Array.from({ length: 10 }, (_, i) => ({ id: i })));

    const claimed = await claimDueMonitors(4);

    assert.equal(claimed.length, 4);
    assert.equal(calls.length, 4);
  });

  it("claims one specific monitor only if it is active and due", async () => {
    queue([{ id: "x" }]);
    const id = oid();

    const claimed = await claimMonitor(id);

    assert.deepEqual(claimed, { id: "x" });
    assert.equal(String(calls[0].filter._id), String(id));
    assert.equal(calls[0].filter.isActive, true);
    assert.ok(calls[0].filter.nextCheckAt.$lte instanceof Date);
  });

  it("checkSoon checks a claimed monitor and logs instead of throwing when it fails", async () => {
    restoreFind = stub(Monitor, "findOneAndUpdate", async () => {
      throw new Error("db down");
    });

    const logged = [];
    const original = console.log;
    console.log = (...args) => logged.push(args.join(" "));

    try {
      checkSoon(oid());
      await sleep(20);
    } finally {
      console.log = original;
    }

    assert.ok(logged.some((line) => line.includes("Immediate check failed") && line.includes("db down")));
  });

  it("checkSoon does nothing when the monitor was already claimed", async () => {
    queue([]);

    await quiet(async () => {
      checkSoon(oid());
      await sleep(20);
    });

    assert.equal(memory.store.results.length, 0);
  });
});
