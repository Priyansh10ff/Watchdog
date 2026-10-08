import "./helpers/env.js";
import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { applyResult } from "../services/incident.service.js";

const NOW = new Date("2026-10-08T12:00:00.000Z").getTime();
const MIN = 60 * 1000;

const monitor = (extra = {}) => ({
  status: "unknown",
  consecutiveFailures: 0,
  failureThreshold: 3,
  intervalMinutes: 5,
  ...extra,
});

const up = (ms = 120) => ({ isUp: true, statusCode: 200, responseTimeMs: ms, errorMessage: "" });
const down = () => ({ isUp: false, statusCode: undefined, responseTimeMs: undefined, errorMessage: "Timed out after 10000 ms" });

describe("status machine (applyResult)", () => {
  beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
  afterEach(() => mock.timers.reset());

  describe("a first success", () => {
    it("makes an unknown monitor up with no transition", () => {
      const m = monitor();
      assert.equal(applyResult(m, up(180)), null);
      assert.equal(m.status, "up");
      assert.equal(m.consecutiveFailures, 0);
      assert.equal(m.lastResponseTimeMs, 180);
      assert.equal(m.lastCheckedAt.getTime(), NOW);
    });

    it("waits the full interval before the next check", () => {
      const m = monitor({ intervalMinutes: 15 });
      applyResult(m, up());
      assert.equal(m.nextCheckAt.getTime(), NOW + 15 * MIN);
    });

    it("waits an hour for a 60 minute monitor", () => {
      const m = monitor({ intervalMinutes: 60 });
      applyResult(m, up());
      assert.equal(m.nextCheckAt.getTime(), NOW + 60 * MIN);
    });
  });

  describe("one or two failures below the threshold", () => {
    it("count the failure but do not call the monitor down", () => {
      const m = monitor({ status: "up" });
      assert.equal(applyResult(m, down()), null);
      assert.equal(m.status, "up");
      assert.equal(m.consecutiveFailures, 1);
      assert.equal(applyResult(m, down()), null);
      assert.equal(m.status, "up");
      assert.equal(m.consecutiveFailures, 2);
    });

    it("leave a monitor that never succeeded as unknown", () => {
      const m = monitor();
      applyResult(m, down());
      assert.equal(m.status, "unknown");
      assert.equal(m.consecutiveFailures, 1);
    });

    it("clear the response time because there was no answer", () => {
      const m = monitor({ status: "up", lastResponseTimeMs: 150 });
      applyResult(m, down());
      assert.equal(m.lastResponseTimeMs, undefined);
    });

    it("re-check within a minute even when the interval is longer", () => {
      const m = monitor({ status: "up", intervalMinutes: 30 });
      applyResult(m, down());
      assert.equal(m.nextCheckAt.getTime(), NOW + MIN);
    });

    it("never wait longer than the interval itself", () => {
      const m = monitor({ status: "up", intervalMinutes: 1 });
      applyResult(m, down());
      assert.equal(m.nextCheckAt.getTime(), NOW + MIN);
    });
  });

  describe("reaching the failure threshold", () => {
    it("turns the monitor down exactly on the third failure", () => {
      const m = monitor({ status: "up" });
      applyResult(m, down());
      applyResult(m, down());
      assert.equal(applyResult(m, down()), "down");
      assert.equal(m.status, "down");
      assert.equal(m.consecutiveFailures, 3);
    });

    it("turns down on the first failure when the threshold is 1", () => {
      const m = monitor({ status: "up", failureThreshold: 1 });
      assert.equal(applyResult(m, down()), "down");
    });

    it("turns down after 10 failures when the threshold is 10", () => {
      const m = monitor({ status: "up", failureThreshold: 10 });
      const results = Array.from({ length: 10 }, () => applyResult(m, down()));
      assert.deepEqual(results.slice(0, 9), Array(9).fill(null));
      assert.equal(results[9], "down");
    });

    it("also turns a monitor that never succeeded down", () => {
      const m = monitor({ failureThreshold: 2 });
      applyResult(m, down());
      assert.equal(applyResult(m, down()), "down");
    });
  });

  describe("while the monitor is down", () => {
    it("reports the transition only once", () => {
      const m = monitor({ status: "up", failureThreshold: 2 });
      applyResult(m, down());
      assert.equal(applyResult(m, down()), "down");
      assert.equal(applyResult(m, down()), null);
      assert.equal(applyResult(m, down()), null);
      assert.equal(m.status, "down");
      assert.equal(m.consecutiveFailures, 4);
    });

    it("keeps re-checking within a minute", () => {
      const m = monitor({ status: "down", consecutiveFailures: 5, intervalMinutes: 45 });
      applyResult(m, down());
      assert.equal(m.nextCheckAt.getTime(), NOW + MIN);
    });
  });

  describe("recovery", () => {
    it("reports recovered on the first success after being down", () => {
      const m = monitor({ status: "down", consecutiveFailures: 4 });
      assert.equal(applyResult(m, up(95)), "recovered");
      assert.equal(m.status, "up");
      assert.equal(m.consecutiveFailures, 0);
      assert.equal(m.lastResponseTimeMs, 95);
    });

    it("goes back to the full interval after recovering", () => {
      const m = monitor({ status: "down", consecutiveFailures: 4, intervalMinutes: 10 });
      applyResult(m, up());
      assert.equal(m.nextCheckAt.getTime(), NOW + 10 * MIN);
    });

    it("does not report recovered after a blip that never reached the threshold", () => {
      const m = monitor({ status: "up" });
      applyResult(m, down());
      applyResult(m, down());
      assert.equal(applyResult(m, up()), null);
      assert.equal(m.status, "up");
      assert.equal(m.consecutiveFailures, 0);
    });

    it("needs the full threshold again after a success resets the count", () => {
      const m = monitor({ status: "up" });
      applyResult(m, down());
      applyResult(m, down());
      applyResult(m, up());
      assert.equal(applyResult(m, down()), null);
      assert.equal(applyResult(m, down()), null);
      assert.equal(applyResult(m, down()), "down");
    });

    it("can go down, recover and go down again", () => {
      const m = monitor({ status: "up", failureThreshold: 1 });
      assert.equal(applyResult(m, down()), "down");
      assert.equal(applyResult(m, up()), "recovered");
      assert.equal(applyResult(m, down()), "down");
    });
  });

  it("always records when the monitor was last checked", () => {
    const m = monitor();
    applyResult(m, down());
    assert.equal(m.lastCheckedAt.getTime(), NOW);
  });
});
