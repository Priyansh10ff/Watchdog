import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Monitor from "../models/monitor.model.js";
import WebhookChannel from "../models/webhookChannel.model.js";
import { processMonitor } from "../services/checker.service.js";
import { onIncidentEvent } from "../services/incident.service.js";
import { notifyIncident } from "../services/alert.service.js";
import { installMemoryApp } from "./helpers/memoryApp.js";
import { startReceiver, startTestServer } from "./helpers/server.js";
import { oid, quiet } from "./helpers/stubs.js";

const FAST = { retryDelayMs: 0, timeoutMs: 500 };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (condition, timeout = 3000) => {
  const started = Date.now();

  while (Date.now() - started < timeout) {
    if (condition()) return true;
    await sleep(20);
  }

  return condition();
};

let target;
let receiver;
let memory;
let owner;
let stopListening;

before(async () => {
  target = await startTestServer();
  receiver = await startReceiver();
});

after(async () => {
  await target.close();
  await receiver.close();
});

beforeEach(() => {
  memory = installMemoryApp();
  owner = oid();
  receiver.requests.length = 0;
  receiver.behavior.statuses = [];
  receiver.behavior.defaultStatus = 204;
  stopListening = onIncidentEvent((kind, incident, monitor) => notifyIncident(kind, incident, monitor, FAST));
});

afterEach(() => {
  stopListening();
  memory.restore();
});

const makeMonitor = (extra = {}) =>
  Monitor.create({
    user: owner,
    name: "Orders API",
    url: `${target.base}/ok`,
    method: "GET",
    timeoutMs: 2000,
    expectedStatusCodes: [200],
    keyword: "",
    failureThreshold: 2,
    intervalMinutes: 5,
    status: "unknown",
    consecutiveFailures: 0,
    ...extra,
  });

const makeChannel = (extra = {}) =>
  WebhookChannel.create({ user: owner, name: "Chat", format: "generic", url: `${receiver.base}/hook`, ...extra });

describe("an outage and a recovery, from the first check to the message", () => {
  it("sends one message when the site goes down, and none for the failed checks after that", async () => {
    await makeChannel();
    const monitor = await makeMonitor({ url: `${target.base}/error` });

    await processMonitor(monitor);
    await sleep(100);
    assert.equal(receiver.requests.length, 0, "one failure is below the threshold");

    const second = await processMonitor(monitor);
    assert.equal(second.incidentEvent, "opened");
    assert.equal(await waitFor(() => receiver.requests.length === 1), true);

    await processMonitor(monitor);
    await processMonitor(monitor);
    await sleep(250);

    assert.equal(receiver.requests.length, 1, "later failures only update the incident");

    const message = receiver.json(0);

    assert.equal(message.event, "incident.opened");
    assert.equal(message.monitor.name, "Orders API");
    assert.equal(message.monitor.host, "127.0.0.1");
    assert.equal(message.incident.status, "open");
    assert.equal(message.incident.cause.statusCode, 500);
    assert.equal(message.incident.cause.errorMessage, "Unexpected status 500");
    assert.equal(message.incident.resolvedAt, null);
    assert.equal(memory.db.incidents.length, 1);
  });

  it("sends a second message with the duration when the site recovers", async () => {
    await makeChannel();
    const monitor = await makeMonitor({ url: `${target.base}/error` });

    await processMonitor(monitor);
    await processMonitor(monitor);
    await waitFor(() => receiver.requests.length === 1);

    await sleep(30);
    monitor.url = `${target.base}/ok`;

    const recovered = await processMonitor(monitor);

    assert.equal(recovered.incidentEvent, "resolved");
    assert.equal(await waitFor(() => receiver.requests.length === 2), true);

    const message = receiver.json(1);

    assert.equal(message.event, "incident.resolved");
    assert.equal(message.incident.status, "resolved");
    assert.equal(message.incident.durationMs >= 0, true);
    assert.equal(typeof message.incident.resolvedAt, "string");
    assert.equal(message.incident.id, receiver.json(0).incident.id, "the same incident");
  });

  it("sends nothing while the site stays up", async () => {
    await makeChannel();
    const monitor = await makeMonitor();

    for (let n = 0; n < 4; n += 1) await processMonitor(monitor);
    await sleep(200);

    assert.equal(receiver.requests.length, 0);
  });

  it("does not message a second time for the next outage until it has recovered", async () => {
    await makeChannel();
    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });

    await processMonitor(monitor);
    await waitFor(() => receiver.requests.length === 1);
    monitor.url = `${target.base}/ok`;
    await processMonitor(monitor);
    await waitFor(() => receiver.requests.length === 2);
    monitor.url = `${target.base}/error`;
    await processMonitor(monitor);
    await waitFor(() => receiver.requests.length === 3);

    assert.deepEqual(receiver.requests.map((request) => JSON.parse(request.body).event), ["incident.opened", "incident.resolved", "incident.opened"]);
    assert.equal(memory.db.incidents.length, 2);
  });

  it("messages each channel in its own format", async () => {
    await makeChannel({ format: "slack", url: `${receiver.base}/slack` });
    await makeChannel({ format: "discord", url: `${receiver.base}/discord` });
    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });

    await processMonitor(monitor);
    await waitFor(() => receiver.requests.length === 2);

    const byPath = Object.fromEntries(receiver.requests.map((request) => [request.url, JSON.parse(request.body)]));

    assert.match(byPath["/slack"].text, /^:red_circle: \*Orders API is down\*/);
    assert.equal(byPath["/discord"].embeds[0].title, "Orders API is down");
  });

  it("keeps the incident and the check history when a channel is broken", async () => {
    receiver.behavior.defaultStatus = 500;

    await makeChannel();
    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });

    await quiet(async () => {
      const result = await processMonitor(monitor);
      assert.equal(result.incidentEvent, "opened");
      await waitFor(() => receiver.requests.length === 2);
      await sleep(50);
    });

    assert.equal(memory.db.incidents.length, 1);
    assert.equal(memory.db.channels[0].lastDelivery.ok, false);
    assert.equal(monitor.status, "down");
  });

  it("does not message the channels of another account", async () => {
    await WebhookChannel.create({ user: oid(), name: "Stranger", format: "generic", url: `${receiver.base}/theirs` });
    await makeChannel({ url: `${receiver.base}/mine` });
    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });

    await processMonitor(monitor);
    await waitFor(() => receiver.requests.length >= 1);
    await sleep(100);

    assert.deepEqual(receiver.requests.map((request) => request.url), ["/mine"]);
  });

  it("does not wait for the message before finishing the check", async () => {
    receiver.behavior.delayMs = 600;

    await makeChannel();
    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });
    const started = Date.now();

    await processMonitor(monitor);

    assert.equal(Date.now() - started < 400, true, "the check waited for the webhook");
    await waitFor(() => receiver.requests.length === 1);
    receiver.behavior.delayMs = 0;
  });
});

describe("incident event listeners", () => {
  it("are told about a new outage with the stored incident and the monitor", async () => {
    stopListening();
    const seen = [];
    stopListening = onIncidentEvent((kind, incident, monitor) => seen.push({ kind, incident, monitor }));

    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });
    await processMonitor(monitor);
    await waitFor(() => seen.length === 1);

    assert.equal(seen[0].kind, "opened");
    assert.equal(String(seen[0].incident._id), String(memory.db.incidents[0]._id));
    assert.equal(seen[0].monitor, monitor);
  });

  it("are told about a recovery", async () => {
    stopListening();
    const kinds = [];
    stopListening = onIncidentEvent((kind) => kinds.push(kind));

    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });
    await processMonitor(monitor);
    monitor.url = `${target.base}/ok`;
    await processMonitor(monitor);
    await waitFor(() => kinds.length === 2);

    assert.deepEqual(kinds, ["opened", "resolved"]);
  });

  it("are not told about further failures of an outage that is already open", async () => {
    stopListening();
    const kinds = [];
    stopListening = onIncidentEvent((kind) => kinds.push(kind));

    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });

    for (let n = 0; n < 4; n += 1) await processMonitor(monitor);
    await sleep(100);

    assert.deepEqual(kinds, ["opened"]);
  });

  it("can be removed again", async () => {
    stopListening();
    const kinds = [];
    const remove = onIncidentEvent((kind) => kinds.push(kind));
    stopListening = () => {};

    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });
    remove();
    await processMonitor(monitor);
    await sleep(100);

    assert.deepEqual(kinds, []);
  });

  it("all hear about it, and one that fails does not stop the others or the check", async () => {
    stopListening();
    const heard = [];
    const removeBroken = onIncidentEvent(() => {
      throw new Error("listener bug");
    });
    const removeAsync = onIncidentEvent(async () => {
      throw new Error("async listener bug");
    });
    const removeGood = onIncidentEvent((kind) => heard.push(kind));
    stopListening = () => {
      removeBroken();
      removeAsync();
      removeGood();
    };

    const lines = [];
    const original = console.log;
    console.log = (...args) => lines.push(args.join(" "));

    try {
      const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });
      const result = await processMonitor(monitor);

      await waitFor(() => heard.length === 1 && lines.length >= 2);

      assert.equal(result.incidentEvent, "opened");
      assert.equal(result.incident.status, "open");
    } finally {
      console.log = original;
    }

    assert.deepEqual(heard, ["opened"]);
    assert.match(lines.join("\n"), /Incident listener failed: listener bug/);
    assert.match(lines.join("\n"), /Incident listener failed: async listener bug/);
  });

  it("are not needed: without any, checks and incidents work as before", async () => {
    stopListening();
    stopListening = () => {};

    const monitor = await makeMonitor({ url: `${target.base}/error`, failureThreshold: 1 });
    const result = await processMonitor(monitor);

    assert.equal(result.incidentEvent, "opened");
    assert.equal(memory.db.incidents.length, 1);
  });
});
