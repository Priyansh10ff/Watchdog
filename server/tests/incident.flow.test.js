import "./helpers/env.js";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleIncident, resolveIncident, trackFailure } from "../services/incident.service.js";
import Incident from "../models/incident.model.js";
import { oid, quiet, stub } from "./helpers/stubs.js";
import { useMemoryStores } from "./helpers/memory.js";

const at = (minutesAgo) => new Date(Date.UTC(2026, 9, 8, 12, 0) - minutesAgo * 60000);

const monitorDoc = (extra = {}) => ({
  _id: oid(),
  user: oid(),
  status: "down",
  consecutiveFailures: 3,
  lastCheckedAt: at(0),
  ...extra,
});

const failure = (extra = {}) => ({
  isUp: false,
  statusCode: 503,
  responseTimeMs: 80,
  errorMessage: "Unexpected status 503",
  ...extra,
});

const success = () => ({ isUp: true, statusCode: 200, responseTimeMs: 90, errorMessage: "" });

describe("incident flow", () => {
  let memory;

  beforeEach(() => {
    memory = useMemoryStores();
  });

  afterEach(() => memory.restore());

  describe("opening an incident", () => {
    it("starts it at the first failing check after the last success, with that check's cause", async () => {
      const monitor = monitorDoc();
      const { results } = memory.store;

      results.push(
        { monitor: monitor._id, isUp: true, checkedAt: at(10), statusCode: 200, errorMessage: "" },
        { monitor: monitor._id, isUp: false, checkedAt: at(3), statusCode: 502, errorMessage: "Unexpected status 502" },
        { monitor: monitor._id, isUp: false, checkedAt: at(2), statusCode: 503, errorMessage: "Unexpected status 503" },
        { monitor: monitor._id, isUp: false, checkedAt: at(1), statusCode: 503, errorMessage: "Unexpected status 503" },
      );

      const { event, incident } = await handleIncident(monitor, failure(), "down");

      assert.equal(event, "opened");
      assert.equal(incident.startedAt.getTime(), at(3).getTime());
      assert.equal(incident.cause.statusCode, 502);
      assert.equal(incident.cause.errorMessage, "Unexpected status 502");
      assert.equal(incident.failedChecks, 3);
      assert.equal(String(incident.monitor), String(monitor._id));
      assert.equal(String(incident.user), String(monitor.user));
    });

    it("ignores failures that happened before an earlier recovery", async () => {
      const monitor = monitorDoc();
      const { results } = memory.store;

      results.push(
        { monitor: monitor._id, isUp: false, checkedAt: at(30), statusCode: 500, errorMessage: "old outage" },
        { monitor: monitor._id, isUp: true, checkedAt: at(20), statusCode: 200, errorMessage: "" },
        { monitor: monitor._id, isUp: false, checkedAt: at(2), statusCode: 503, errorMessage: "new outage" },
      );

      const { incident } = await handleIncident(monitor, failure(), "down");

      assert.equal(incident.startedAt.getTime(), at(2).getTime());
      assert.equal(incident.cause.errorMessage, "new outage");
    });

    it("uses the earliest failure when the monitor never had a success", async () => {
      const monitor = monitorDoc();
      const { results } = memory.store;

      results.push(
        { monitor: monitor._id, isUp: false, checkedAt: at(5), statusCode: undefined, errorMessage: "Connection refused" },
        { monitor: monitor._id, isUp: false, checkedAt: at(4), statusCode: undefined, errorMessage: "Connection refused" },
      );

      const { incident } = await handleIncident(monitor, failure({ statusCode: undefined }), "down");

      assert.equal(incident.startedAt.getTime(), at(5).getTime());
      assert.equal(incident.cause.statusCode, null);
      assert.equal(incident.cause.errorMessage, "Connection refused");
    });

    it("falls back to the current check when no failure was stored yet", async () => {
      const monitor = monitorDoc({ consecutiveFailures: 1, lastCheckedAt: at(0) });

      const { incident } = await handleIncident(monitor, failure(), "down");

      assert.equal(incident.startedAt.getTime(), at(0).getTime());
      assert.equal(incident.cause.errorMessage, "Unexpected status 503");
      assert.equal(incident.failedChecks, 1);
    });

    it("records the latest error separately from the cause", async () => {
      const monitor = monitorDoc();

      memory.store.results.push({ monitor: monitor._id, isUp: false, checkedAt: at(3), statusCode: 502, errorMessage: "first" });

      const { incident } = await handleIncident(monitor, failure({ errorMessage: "latest" }), "down");

      assert.equal(incident.cause.errorMessage, "first");
      assert.equal(incident.lastError.errorMessage, "latest");
      assert.equal(incident.lastError.at.getTime(), at(0).getTime());
    });
  });

  describe("while the outage continues", () => {
    it("updates the open incident instead of creating another", async () => {
      const monitor = monitorDoc();

      await handleIncident(monitor, failure(), "down");
      const again = await handleIncident(monitor, failure({ errorMessage: "still failing" }), null);

      assert.equal(again.event, "updated");
      assert.equal(memory.store.creates, 1);
      assert.equal(memory.store.incidents.length, 1);
      assert.equal(again.incident.failedChecks, 4);
      assert.equal(again.incident.lastError.errorMessage, "still failing");
    });

    it("keeps exactly one incident across many failing checks", async () => {
      const monitor = monitorDoc();

      for (let i = 0; i < 10; i += 1) {
        await handleIncident(monitor, failure(), i === 0 ? "down" : null);
      }

      assert.equal(memory.store.creates, 1);
      assert.equal(memory.store.incidents[0].failedChecks, 12);
    });

    it("adopts the existing incident when two checks race to open it", async () => {
      const monitor = monitorDoc();
      const existing = { _id: oid(), monitor: monitor._id, isResolved: false, status: "open", failedChecks: 3, save: async () => {} };

      let created = 0;
      const restores = [
        stub(Incident, "findOneAndUpdate", async () => null),
        stub(Incident, "create", async () => {
          created += 1;
          throw Object.assign(new Error("duplicate key"), { code: 11000 });
        }),
        stub(Incident, "findOne", async () => existing),
      ];

      try {
        const { event, incident } = await handleIncident(monitor, failure(), "down");

        assert.equal(created, 1);
        assert.equal(event, "updated");
        assert.equal(incident, existing);
      } finally {
        restores.forEach((restore) => restore());
      }
    });

    it("swallows other database errors so checking is never stopped", async () => {
      const monitor = monitorDoc();
      memory.store.createError = new Error("connection lost");

      const outcome = await quiet(() => handleIncident(monitor, failure(), "down"));

      assert.deepEqual(outcome, { event: null, incident: null });
    });
  });

  describe("not yet an outage", () => {
    it("does nothing for a failure while the monitor is still up", async () => {
      const monitor = monitorDoc({ status: "up", consecutiveFailures: 1 });

      const outcome = await handleIncident(monitor, failure(), null);

      assert.deepEqual(outcome, { event: null, incident: null });
      assert.equal(memory.store.findOneAndUpdateCalls, 0);
      assert.equal(memory.store.creates, 0);
    });

    it("does nothing for a success without a transition", async () => {
      const monitor = monitorDoc({ status: "up", consecutiveFailures: 0 });

      const outcome = await handleIncident(monitor, success(), null);

      assert.deepEqual(outcome, { event: null, incident: null });
      assert.equal(memory.store.findOneAndUpdateCalls, 0);
    });
  });

  describe("recovery", () => {
    it("resolves the open incident with its duration", async () => {
      const monitor = monitorDoc();

      memory.store.results.push({ monitor: monitor._id, isUp: false, checkedAt: at(12), statusCode: 503, errorMessage: "x" });
      await handleIncident(monitor, failure(), "down");

      monitor.status = "up";
      monitor.lastCheckedAt = at(0);
      const { event, incident } = await handleIncident(monitor, success(), "recovered");

      assert.equal(event, "resolved");
      assert.equal(incident.status, "resolved");
      assert.equal(incident.isResolved, true);
      assert.equal(incident.resolvedAt.getTime(), at(0).getTime());
      assert.equal(incident.durationMs, 12 * 60000);
    });

    it("reports no event when there was no open incident", async () => {
      const monitor = monitorDoc({ status: "up" });

      const outcome = await handleIncident(monitor, success(), "recovered");

      assert.deepEqual(outcome, { event: null, incident: null });
    });

    it("never records a negative duration", async () => {
      const monitor = monitorDoc({ lastCheckedAt: at(10) });
      memory.store.incidents.push({
        _id: oid(),
        monitor: monitor._id,
        isResolved: false,
        status: "open",
        startedAt: at(0),
        save: async () => {},
      });

      const incident = await resolveIncident(monitor);

      assert.equal(incident.durationMs, 0);
    });

    it("lets the next outage open a fresh incident", async () => {
      const monitor = monitorDoc();

      await handleIncident(monitor, failure(), "down");
      monitor.status = "up";
      await handleIncident(monitor, success(), "recovered");

      monitor.status = "down";
      const second = await handleIncident(monitor, failure(), "down");

      assert.equal(second.event, "opened");
      assert.equal(memory.store.incidents.length, 2);
      assert.deepEqual(
        memory.store.incidents.map((incident) => incident.isResolved),
        [true, false],
      );
    });
  });

  describe("trackFailure", () => {
    it("returns whether it opened a new incident", async () => {
      const monitor = monitorDoc();

      const first = await trackFailure(monitor, failure());
      const second = await trackFailure(monitor, failure());

      assert.equal(first.opened, true);
      assert.equal(second.opened, false);
      assert.equal(first.incident, memory.store.incidents[0]);
    });
  });
});
