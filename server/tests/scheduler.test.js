import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Monitor from "../models/monitor.model.js";
import { runDueChecks, startScheduler, stopScheduler } from "../jobs/scheduler.js";
import { oid, quiet, stub } from "./helpers/stubs.js";
import { useMemoryStores } from "./helpers/memory.js";
import { startTestServer } from "./helpers/server.js";

let server;
let memory;
let restoreFind;
let claimCalls;

const monitorDoc = (path = "/ok", extra = {}) => {
  const doc = {
    _id: oid(),
    user: oid(),
    url: `${server.base}${path}`,
    method: "GET",
    timeoutMs: 2000,
    expectedStatusCodes: [200],
    keyword: "",
    failureThreshold: 3,
    intervalMinutes: 5,
    status: "unknown",
    consecutiveFailures: 0,
    saved: false,
    ...extra,
  };

  doc.save = async () => {
    doc.saved = true;
  };

  return doc;
};

const queue = (docs) => {
  claimCalls = 0;
  restoreFind = stub(Monitor, "findOneAndUpdate", async () => {
    claimCalls += 1;
    return docs.shift() || null;
  });
};

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server.close();
});

beforeEach(() => {
  server.reset();
  memory = useMemoryStores();
});

afterEach(() => {
  memory.restore();
  if (restoreFind) restoreFind();
});

describe("scheduler", () => {
  it("checks every claimed monitor and saves each one", async () => {
    const docs = Array.from({ length: 5 }, () => monitorDoc());
    const all = [...docs];
    queue(docs);

    await runDueChecks();

    assert.equal(server.state.hits, 5);
    assert.ok(all.every((doc) => doc.saved && doc.status === "up"));
    assert.equal(memory.store.results.length, 5);
  });

  it("does nothing when no monitor is due", async () => {
    queue([]);

    await runDueChecks();

    assert.equal(server.state.hits, 0);
    assert.equal(claimCalls, 1);
  });

  it("checks at most 10 monitors at the same time", async () => {
    queue(Array.from({ length: 25 }, () => monitorDoc("/delay")));

    await runDueChecks();

    assert.equal(server.state.hits, 25);
    assert.ok(server.state.maxConcurrent <= 10, `ran ${server.state.maxConcurrent} at once`);
    assert.ok(server.state.maxConcurrent >= 5, "expected the batch to run in parallel");
  });

  it("claims at most 200 monitors in one run and leaves the rest for the next", async () => {
    const docs = Array.from({ length: 230 }, () => monitorDoc());
    queue(docs);

    await runDueChecks();

    assert.equal(server.state.hits, 200);
    assert.equal(docs.length, 30);
  });

  it("keeps going when one monitor's check fails", async () => {
    const broken = monitorDoc();
    broken.save = async () => {
      throw new Error("disk full");
    };
    const good = [monitorDoc(), monitorDoc(), monitorDoc()];
    queue([monitorDoc(), broken, ...good]);

    const logged = [];
    const original = console.log;
    console.log = (...args) => logged.push(args.join(" "));

    try {
      await runDueChecks();
    } finally {
      console.log = original;
    }

    assert.ok(good.every((doc) => doc.saved));
    assert.ok(logged.some((line) => line.includes("Check failed for") && line.includes("disk full")));
  });

  it("does not start a second run while one is still going", async () => {
    queue(Array.from({ length: 3 }, () => monitorDoc("/delay")));

    const first = runDueChecks();
    const second = runDueChecks();

    await Promise.all([first, second]);

    assert.equal(server.state.hits, 3);
    assert.equal(claimCalls, 4);
  });

  it("can run again after a run finishes", async () => {
    queue([monitorDoc()]);
    await runDueChecks();

    queue([monitorDoc(), monitorDoc()]);
    await runDueChecks();

    assert.equal(server.state.hits, 3);
  });

  it("recovers from an error while claiming and runs again next time", async () => {
    restoreFind = stub(Monitor, "findOneAndUpdate", async () => {
      throw new Error("database unavailable");
    });

    const logged = [];
    const original = console.log;
    console.log = (...args) => logged.push(args.join(" "));

    try {
      await runDueChecks();
    } finally {
      console.log = original;
    }

    assert.ok(logged.some((line) => line.includes("Scheduler error:") && line.includes("database unavailable")));

    restoreFind();
    queue([monitorDoc()]);
    await runDueChecks();

    assert.equal(server.state.hits, 1);
  });

  it("starts and stops cleanly, so the process can exit", async () => {
    queue([]);

    await quiet(async () => {
      startScheduler();
      await runDueChecks();
    });

    stopScheduler();
    stopScheduler();
  });
});
