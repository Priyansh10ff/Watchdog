import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SLOW_MS, getState, hasPendingFirstCheck, isAwaitingFirstCheck, sortMonitors, summarize } from "../src/utils/monitorState.js";

const monitor = (name, extra = {}) => ({
  name,
  isActive: true,
  status: "up",
  lastResponseTimeMs: 120,
  ...extra,
});

describe("getState", () => {
  it("is paused whenever the monitor is switched off, whatever its last status was", () => {
    assert.equal(getState(monitor("a", { isActive: false })), "paused");
    assert.equal(getState(monitor("a", { isActive: false, status: "down" })), "paused");
  });

  it("is down when the monitor is down", () => {
    assert.equal(getState(monitor("a", { status: "down", lastResponseTimeMs: undefined })), "down");
  });

  it("is up for a fast answer", () => {
    assert.equal(getState(monitor("a", { lastResponseTimeMs: 120 })), "up");
  });

  it("calls an answer slow only above 1.5 seconds", () => {
    assert.equal(SLOW_MS, 1500);
    assert.equal(getState(monitor("a", { lastResponseTimeMs: 1500 })), "up");
    assert.equal(getState(monitor("a", { lastResponseTimeMs: 1501 })), "slow");
    assert.equal(getState(monitor("a", { lastResponseTimeMs: 9000 })), "slow");
  });

  it("stays up when the last check had no reply but the failure threshold is not reached", () => {
    assert.equal(getState(monitor("a", { lastResponseTimeMs: undefined })), "up");
    assert.equal(getState(monitor("a", { lastResponseTimeMs: null })), "up");
  });

  it("is waiting before the first check", () => {
    assert.equal(getState(monitor("a", { status: "unknown", lastResponseTimeMs: undefined })), "waiting");
    assert.equal(getState({ name: "a", isActive: true }), "waiting");
  });
});

describe("sortMonitors", () => {
  it("puts problems first: down, slow, waiting, up, then paused", () => {
    const list = [
      monitor("paused", { isActive: false }),
      monitor("up"),
      monitor("waiting", { status: "unknown" }),
      monitor("slow", { lastResponseTimeMs: 3000 }),
      monitor("down", { status: "down" }),
    ];

    assert.deepEqual(sortMonitors(list).map((m) => m.name), ["down", "slow", "waiting", "up", "paused"]);
  });

  it("keeps the original order among monitors in the same state", () => {
    const list = [monitor("c"), monitor("a"), monitor("b")];

    assert.deepEqual(sortMonitors(list).map((m) => m.name), ["c", "a", "b"]);
  });

  it("does not change the list it was given", () => {
    const list = [monitor("up"), monitor("down", { status: "down" })];

    sortMonitors(list);

    assert.deepEqual(list.map((m) => m.name), ["up", "down"]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(sortMonitors([]), []);
  });
});

describe("summarize", () => {
  it("asks for a first monitor when there are none", () => {
    const summary = summarize([]);

    assert.equal(summary.mode, "up");
    assert.equal(summary.headline, "Nothing to watch yet");
  });

  it("says one monitor is up or all of them are", () => {
    assert.equal(summarize([monitor("a")]).headline, "Your monitor is up");
    assert.equal(summarize([monitor("a"), monitor("b"), monitor("c")]).headline, "All 3 monitors are up");
    assert.equal(summarize([monitor("a"), monitor("b")]).mode, "up");
  });

  it("names a single monitor that is down", () => {
    const summary = summarize([monitor("a"), monitor("API", { status: "down" })]);

    assert.equal(summary.mode, "down");
    assert.equal(summary.headline, "API is down");
  });

  it("counts several monitors that are down", () => {
    const summary = summarize([monitor("a", { status: "down" }), monitor("b", { status: "down" }), monitor("c")]);

    assert.equal(summary.headline, "2 monitors are down");
  });

  it("puts an outage ahead of slowness", () => {
    const summary = summarize([monitor("slow", { lastResponseTimeMs: 4000 }), monitor("down", { status: "down" })]);

    assert.equal(summary.mode, "down");
  });

  it("reports slow monitors with the right grammar", () => {
    const one = summarize([monitor("a", { lastResponseTimeMs: 3000 }), monitor("b")]);
    const two = summarize([monitor("a", { lastResponseTimeMs: 3000 }), monitor("b", { lastResponseTimeMs: 2000 })]);

    assert.equal(one.mode, "slow");
    assert.equal(one.headline, "1 monitor is slow");
    assert.equal(two.headline, "2 monitors are slow");
  });

  it("says everything is paused when nothing is active", () => {
    const summary = summarize([monitor("a", { isActive: false }), monitor("b", { isActive: false })]);

    assert.equal(summary.mode, "up");
    assert.equal(summary.headline, "Everything is paused");
  });

  it("waits for the first checks when no active monitor has been checked yet", () => {
    const summary = summarize([monitor("a", { status: "unknown" }), monitor("b", { status: "unknown" })]);

    assert.equal(summary.headline, "Waiting for the first checks");
  });

  it("mixes up and waiting monitors", () => {
    const summary = summarize([monitor("a"), monitor("b"), monitor("c", { status: "unknown" })]);

    assert.equal(summary.headline, "2 up, 1 waiting");
  });

  it("does not count paused monitors as part of the picture", () => {
    assert.equal(summarize([monitor("a"), monitor("b", { isActive: false })]).headline, "Your monitor is up");
    assert.equal(summarize([monitor("a", { isActive: false }), monitor("b", { status: "down" })]).headline, "b is down");
  });

  it("always gives a hint to show under the headline", () => {
    for (const list of [[], [monitor("a")], [monitor("a", { status: "down" })], [monitor("a", { lastResponseTimeMs: 5000 })], [monitor("a", { isActive: false })]]) {
      assert.ok(summarize(list).hint.length > 10);
    }
  });
});

describe("isAwaitingFirstCheck", () => {
  it("is true for an active monitor that has never been checked", () => {
    assert.equal(isAwaitingFirstCheck({ isActive: true }), true);
    assert.equal(isAwaitingFirstCheck({ isActive: true, lastCheckedAt: null }), true);
  });

  it("is false once it has been checked", () => {
    assert.equal(isAwaitingFirstCheck({ isActive: true, lastCheckedAt: "2026-10-11T12:00:00.000Z" }), false);
  });

  it("is false for a paused monitor, which is not going to be checked", () => {
    assert.equal(isAwaitingFirstCheck({ isActive: false }), false);
  });

  it("treats a missing isActive as active", () => {
    assert.equal(isAwaitingFirstCheck({}), true);
  });

  it("is false for nothing at all", () => {
    assert.equal(isAwaitingFirstCheck(null), false);
    assert.equal(isAwaitingFirstCheck(undefined), false);
  });
});

describe("hasPendingFirstCheck", () => {
  const checked = { isActive: true, lastCheckedAt: "2026-10-11T12:00:00.000Z" };

  it("is true when any monitor is still waiting for its first check", () => {
    assert.equal(hasPendingFirstCheck([checked, { isActive: true }]), true);
  });

  it("is false when every monitor has a result", () => {
    assert.equal(hasPendingFirstCheck([checked, checked]), false);
  });

  it("is false for an empty list or anything that is not a list", () => {
    assert.equal(hasPendingFirstCheck([]), false);
    assert.equal(hasPendingFirstCheck(null), false);
    assert.equal(hasPendingFirstCheck(undefined), false);
  });

  it("ignores paused monitors that have never been checked", () => {
    assert.equal(hasPendingFirstCheck([checked, { isActive: false }]), false);
  });
});
