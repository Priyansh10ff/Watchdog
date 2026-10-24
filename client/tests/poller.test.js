import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { pollDelay, startPolling } from "../src/utils/poller.js";

const REFRESH = 60000;
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("pollDelay", () => {
  it("waits the normal refresh time when nothing has failed", () => {
    assert.equal(pollDelay(0, REFRESH), REFRESH);
  });

  it("retries quickly after a failure and backs off", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map((n) => pollDelay(n, REFRESH)), [3000, 6000, 12000, 20000, 30000]);
  });

  it("goes back to the normal refresh time after the quick retries", () => {
    assert.equal(pollDelay(6, REFRESH), REFRESH);
    assert.equal(pollDelay(50, REFRESH), REFRESH);
  });

  it("treats odd input as no failures", () => {
    assert.equal(pollDelay(-1, REFRESH), REFRESH);
    assert.equal(pollDelay(1.5, REFRESH), REFRESH);
    assert.equal(pollDelay(Number.NaN, REFRESH), REFRESH);
    assert.equal(pollDelay(undefined, REFRESH), REFRESH);
    assert.equal(pollDelay("2", REFRESH), REFRESH);
  });

  it("never waits longer than the normal refresh time for a retry", () => {
    for (let n = 1; n <= 20; n += 1) assert.ok(pollDelay(n, REFRESH) <= REFRESH);
  });
});

describe("startPolling", () => {
  let calls;
  let outcomes;
  let stop;

  const task = async () => {
    calls += 1;
    const outcome = outcomes.length ? outcomes.shift() : true;
    if (outcome === "throw") throw new Error("network down");
    return outcome;
  };

  beforeEach(() => {
    calls = 0;
    outcomes = [];
    stop = null;
    mock.timers.enable({ apis: ["setTimeout"] });
  });

  afterEach(() => {
    if (stop) stop();
    mock.timers.reset();
  });

  it("loads straight away", async () => {
    stop = startPolling(task, REFRESH);
    await flush();

    assert.equal(calls, 1);
  });

  it("loads again after the normal refresh time while it keeps working", async () => {
    stop = startPolling(task, REFRESH);
    await flush();
    mock.timers.tick(REFRESH - 1);
    await flush();
    assert.equal(calls, 1);

    mock.timers.tick(1);
    await flush();
    assert.equal(calls, 2);

    mock.timers.tick(REFRESH);
    await flush();
    assert.equal(calls, 3);
  });

  it("retries after 3, 6, 12, 20 and 30 seconds, then falls back to the normal time", async () => {
    outcomes = [false, false, false, false, false, false];
    stop = startPolling(task, REFRESH);
    await flush();

    for (const [index, wait] of [3000, 6000, 12000, 20000, 30000].entries()) {
      mock.timers.tick(wait - 1);
      await flush();
      assert.equal(calls, index + 1, `too early before retry ${index + 1}`);
      mock.timers.tick(1);
      await flush();
      assert.equal(calls, index + 2, `no retry after ${wait} ms`);
    }

    mock.timers.tick(REFRESH - 1);
    await flush();
    assert.equal(calls, 6);
    mock.timers.tick(1);
    await flush();
    assert.equal(calls, 7);
  });

  it("starts the quick retries over after a success", async () => {
    outcomes = [false, true, false];
    stop = startPolling(task, REFRESH);
    await flush();

    mock.timers.tick(3000);
    await flush();
    assert.equal(calls, 2);

    mock.timers.tick(REFRESH);
    await flush();
    assert.equal(calls, 3);

    mock.timers.tick(3000);
    await flush();
    assert.equal(calls, 4);
  });

  it("counts a task that throws as a failure", async () => {
    outcomes = ["throw"];
    stop = startPolling(task, REFRESH);
    await flush();

    mock.timers.tick(3000);
    await flush();

    assert.equal(calls, 2);
  });

  it("counts a task that returns nothing as a success", async () => {
    outcomes = [undefined];
    stop = startPolling(task, REFRESH);
    await flush();

    mock.timers.tick(3000);
    await flush();
    assert.equal(calls, 1);

    mock.timers.tick(REFRESH);
    await flush();
    assert.equal(calls, 2);
  });

  it("stops for good, including a retry that was already waiting", async () => {
    outcomes = [false];
    stop = startPolling(task, REFRESH);
    await flush();

    stop();
    mock.timers.tick(REFRESH * 5);
    await flush();

    assert.equal(calls, 1);
  });

  it("does not schedule anything when it is stopped while a load is still running", async () => {
    let release;
    const slow = () =>
      new Promise((resolve) => {
        calls += 1;
        release = resolve;
      });

    stop = startPolling(slow, REFRESH);
    await flush();
    stop();
    release(true);
    await flush();
    mock.timers.tick(REFRESH * 5);
    await flush();

    assert.equal(calls, 1);
  });
});
