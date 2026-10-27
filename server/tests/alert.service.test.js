import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import WebhookChannel from "../models/webhookChannel.model.js";
import {
  deliver,
  describeEvent,
  discordPayload,
  genericPayload,
  notifyIncident,
  sendTest,
  sign,
  slackPayload,
} from "../services/alert.service.js";
import { freePort, startReceiver } from "./helpers/server.js";
import { installMemoryApp } from "./helpers/memoryApp.js";
import { oid, quiet, stub } from "./helpers/stubs.js";

const FAST = { retryDelayMs: 0, timeoutMs: 400 };
const SECRET_PATH = "/services/T000/B000/SECRETTOKEN";

const monitor = (extra = {}) => ({
  _id: oid(),
  user: oid(),
  name: "Orders API",
  url: "https://api.acme.example/health?token=abc123",
  ...extra,
});

const openedIncident = (extra = {}) => ({
  _id: oid(),
  status: "open",
  startedAt: new Date("2026-10-11T17:52:00.000Z"),
  cause: { statusCode: 503, errorMessage: "Unexpected status 503" },
  ...extra,
});

const resolvedIncident = (extra = {}) =>
  openedIncident({
    status: "resolved",
    resolvedAt: new Date("2026-10-11T18:06:00.000Z"),
    durationMs: 14 * 60 * 1000,
    ...extra,
  });

describe("describeEvent", () => {
  it("describes an outage with the site, the cause and the start", () => {
    const info = describeEvent("opened", monitor(), openedIncident());

    assert.equal(info.type, "incident.opened");
    assert.equal(info.title, "Orders API is down");
    assert.deepEqual(info.fields, [
      ["Site", "api.acme.example"],
      ["Cause", "Unexpected status 503"],
      ["Started", "11 Oct 2026, 17:52 UTC"],
    ]);
  });

  it("describes a recovery with how long it lasted", () => {
    const info = describeEvent("resolved", monitor(), resolvedIncident());

    assert.equal(info.type, "incident.resolved");
    assert.equal(info.title, "Orders API is back up");
    assert.deepEqual(info.fields, [
      ["Site", "api.acme.example"],
      ["Down for", "14m 0s"],
      ["Cause", "Unexpected status 503"],
      ["Resolved", "11 Oct 2026, 18:06 UTC"],
    ]);
  });

  it("describes a test message without a monitor", () => {
    const info = describeEvent("test");

    assert.equal(info.type, "test");
    assert.equal(info.monitor, null);
    assert.equal(info.incident, null);
    assert.match(info.summary, /You will get a message here/);
  });

  it("shows only the host name, never the address, the path or the query", () => {
    const info = describeEvent("opened", monitor(), openedIncident());
    const text = JSON.stringify(info.fields) + info.title;

    assert.equal(text.includes("token"), false);
    assert.equal(text.includes("abc123"), false);
    assert.equal(text.includes("https://"), false);
  });

  it("drops a leading www from the host", () => {
    const info = describeEvent("opened", monitor({ url: "https://www.example.com/x" }), openedIncident());

    assert.equal(info.fields[0][1], "example.com");
  });

  it("falls back from the error text to the status code to no reply", () => {
    const text = (cause) => describeEvent("opened", monitor(), openedIncident({ cause })).fields[1][1];

    assert.equal(text({ statusCode: 502, errorMessage: "" }), "Status 502");
    assert.equal(text({ statusCode: null, errorMessage: "" }), "No reply");
    assert.equal(text(undefined), "No reply");
    assert.equal(text({ statusCode: 500, errorMessage: "Timed out after 5000 ms" }), "Timed out after 5000 ms");
  });

  it("shortens a very long name and a very long cause", () => {
    const info = describeEvent("opened", monitor({ name: "N".repeat(200) }), openedIncident({ cause: { errorMessage: "E".repeat(500) } }));

    assert.equal(info.title.length <= 60 + " is down".length, true);
    assert.equal(info.fields[1][1].length <= 200, true);
    assert.equal(info.monitor.name.length <= 60, true);
  });

  it("links to the incidents page of the client when CLIENT_URL is set, and to nothing otherwise", () => {
    assert.equal(describeEvent("opened", monitor(), openedIncident()).link, "http://localhost:5173/incidents");

    const saved = process.env.CLIENT_URL;

    try {
      delete process.env.CLIENT_URL;
      assert.equal(describeEvent("opened", monitor(), openedIncident()).link, "");
      process.env.CLIENT_URL = "javascript:alert(1)";
      assert.equal(describeEvent("opened", monitor(), openedIncident()).link, "");
      process.env.CLIENT_URL = "not a url";
      assert.equal(describeEvent("opened", monitor(), openedIncident()).link, "");
    } finally {
      process.env.CLIENT_URL = saved;
    }
  });

  it("shows unknown for a missing date or duration instead of failing", () => {
    const info = describeEvent("resolved", monitor(), resolvedIncident({ resolvedAt: undefined, durationMs: undefined }));

    assert.equal(info.fields[1][1], "unknown");
    assert.equal(info.fields[3][1], "unknown");
  });
});

describe("Slack message", () => {
  it("has a red mark and a bold title for an outage, and the details on their own lines", () => {
    const { text } = slackPayload(describeEvent("opened", monitor(), openedIncident()));
    const lines = text.split("\n");

    assert.equal(lines[0], ":red_circle: *Orders API is down*");
    assert.deepEqual(lines.slice(1, 4), ["Site: api.acme.example", "Cause: Unexpected status 503", "Started: 11 Oct 2026, 17:52 UTC"]);
    assert.equal(lines[4], "<http://localhost:5173/incidents|Open Watchdog>");
  });

  it("has a green mark for a recovery and a bell for a test", () => {
    assert.match(slackPayload(describeEvent("resolved", monitor(), resolvedIncident())).text, /^:large_green_circle: \*Orders API is back up\*/);
    assert.match(slackPayload(describeEvent("test")).text, /^:bell: \*Watchdog test message\*\nThis channel is connected/);
  });

  it("escapes the characters Slack treats as markup, so a name cannot form a link or a mention", () => {
    const { text } = slackPayload(describeEvent("opened", monitor({ name: "<!channel> & <http://evil.example|click>" }), openedIncident()));

    assert.equal(text.includes("<!channel>"), false);
    assert.equal(text.includes("<http://evil.example|click>"), false);
    assert.match(text, /&lt;!channel&gt; &amp; &lt;http:\/\/evil\.example\|click&gt;/);
  });

  it("has no link line when there is no link", () => {
    const saved = process.env.CLIENT_URL;

    try {
      delete process.env.CLIENT_URL;
      assert.equal(slackPayload(describeEvent("opened", monitor(), openedIncident())).text.includes("Open Watchdog"), false);
    } finally {
      process.env.CLIENT_URL = saved;
    }
  });

  it("is plain text only, which every Slack incoming webhook accepts", () => {
    assert.deepEqual(Object.keys(slackPayload(describeEvent("test"))), ["text"]);
  });
});

describe("Discord message", () => {
  const embed = (kind, ...args) => discordPayload(describeEvent(kind, ...args)).embeds[0];

  it("is sent as Watchdog and can never mention anyone", () => {
    const payload = discordPayload(describeEvent("opened", monitor({ name: "@everyone <@123>" }), openedIncident()));

    assert.equal(payload.username, "Watchdog");
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
  });

  it("uses red for an outage, green for a recovery and blue for a test", () => {
    assert.equal(embed("opened", monitor(), openedIncident()).color, 0xd4351c);
    assert.equal(embed("resolved", monitor(), resolvedIncident()).color, 0x2ea44f);
    assert.equal(embed("test").color, 0x2b46ff);
  });

  it("puts the details in fields and links the title to the incidents page", () => {
    const item = embed("opened", monitor(), openedIncident());

    assert.deepEqual(item.fields.map((field) => field.name), ["Site", "Cause", "Started"]);
    assert.equal(item.fields[0].value, "api.acme.example");
    assert.equal(item.url, "http://localhost:5173/incidents");
    assert.equal(item.footer.text, "Watchdog");
    assert.equal(new Date(item.timestamp).toString() === "Invalid Date", false);
  });

  it("escapes markdown so a name cannot restyle the message", () => {
    const item = embed("opened", monitor({ name: "**bold** _it_ `code` ~~gone~~ |spoiler| > quote" }), openedIncident());

    assert.equal(item.title.includes("**bold**"), false);
    assert.match(item.title, /\\\*\\\*bold\\\*\\\*/);
  });

  it("keeps every part inside Discord's limits", () => {
    const item = embed("opened", monitor({ name: "N".repeat(400) }), openedIncident({ cause: { errorMessage: "E".repeat(3000) } }));

    assert.equal(item.title.length <= 256, true);
    for (const field of item.fields) assert.equal(field.value.length <= 1024, true);
  });

  it("has a description for a test message and none for an incident", () => {
    assert.match(embed("test").description, /This channel is connected/);
    assert.equal(embed("opened", monitor(), openedIncident()).description, undefined);
  });

  it("never needs an empty field value, which Discord refuses", () => {
    const item = embed("opened", monitor({ url: "not a url" }), openedIncident());

    for (const field of item.fields) assert.notEqual(field.value, "");
  });
});

describe("generic message", () => {
  it("describes an outage as incident.opened, with no end and no duration yet", () => {
    const payload = genericPayload(describeEvent("opened", monitor({ _id: "m1" }), openedIncident({ _id: "i1" })));

    assert.equal(payload.event, "incident.opened");
    assert.equal(payload.message, "Orders API is down");
    assert.deepEqual(payload.monitor, { id: "m1", name: "Orders API", host: "api.acme.example" });
    assert.equal(payload.incident.id, "i1");
    assert.equal(payload.incident.status, "open");
    assert.equal(payload.incident.resolvedAt, null);
    assert.equal(payload.incident.durationMs, null);
    assert.deepEqual(payload.incident.cause, { statusCode: 503, errorMessage: "Unexpected status 503" });
    assert.equal(new Date(payload.sentAt).toString() === "Invalid Date", false);
  });

  it("describes a recovery as incident.resolved, with the end and the duration", () => {
    const payload = genericPayload(describeEvent("resolved", monitor(), resolvedIncident()));

    assert.equal(payload.event, "incident.resolved");
    assert.equal(payload.incident.status, "resolved");
    assert.equal(payload.incident.durationMs, 14 * 60 * 1000);
    assert.equal(new Date(payload.incident.resolvedAt).toISOString(), "2026-10-11T18:06:00.000Z");
  });

  it("describes a test with only the event, the time and the message", () => {
    const payload = genericPayload(describeEvent("test"));

    assert.deepEqual(Object.keys(payload).sort(), ["event", "message", "sentAt"]);
    assert.equal(payload.event, "test");
  });

  it("never contains the monitored address, its path or its query", () => {
    const text = JSON.stringify(genericPayload(describeEvent("opened", monitor(), openedIncident())));

    assert.equal(text.includes("abc123"), false);
    assert.equal(text.includes("/health"), false);
    assert.equal(text.includes("https://"), false);
  });

  it("gives a missing cause as an empty text and a null code", () => {
    const payload = genericPayload(describeEvent("opened", monitor(), openedIncident({ cause: undefined })));

    assert.deepEqual(payload.incident.cause, { statusCode: null, errorMessage: "" });
  });
});

describe("signing", () => {
  it("is an HMAC SHA-256 of the timestamp, a dot and the body, in hex", () => {
    assert.equal(sign("secret", "1700000000", '{"a":1}'), "49f24e537407743fa4a0242bb63b94b9a47ee99cbbe071ccd8a22550ae411686");
  });

  it("changes with the secret, the timestamp and the body", () => {
    const base = sign("secret", "1", "body");

    assert.notEqual(base, sign("other", "1", "body"));
    assert.notEqual(base, sign("secret", "2", "body"));
    assert.notEqual(base, sign("secret", "1", "body2"));
    assert.equal(base, sign("secret", "1", "body"));
  });
});

describe("delivery", () => {
  let receiver;

  before(async () => {
    receiver = await startReceiver();
  });

  after(async () => {
    await receiver.close();
  });

  beforeEach(() => {
    receiver.requests.length = 0;
    receiver.behavior.statuses = [];
    receiver.behavior.defaultStatus = 204;
    receiver.behavior.delayMs = 0;
    receiver.behavior.body = undefined;
  });

  const channel = (extra = {}) => ({ _id: oid(), format: "generic", url: `${receiver.base}/hook`, signingSecret: "", ...extra });
  const info = () => describeEvent("opened", monitor(), openedIncident());

  it("posts JSON, says who is calling and what happened, and reports success", async () => {
    const outcome = await deliver(channel(), info(), FAST);

    assert.deepEqual(outcome, { ok: true, statusCode: 204, error: "", attempts: 1 });
    assert.equal(receiver.requests.length, 1);

    const request = receiver.requests[0];

    assert.equal(request.method, "POST");
    assert.equal(request.url, "/hook");
    assert.equal(request.headers["content-type"], "application/json");
    assert.match(request.headers["user-agent"], /^WatchdogBot\//);
    assert.equal(request.headers["x-watchdog-event"], "incident.opened");
    assert.equal(receiver.json(0).event, "incident.opened");
  });

  it("counts a 200 as delivered, which is what Slack answers", async () => {
    receiver.behavior.defaultStatus = 200;

    assert.equal((await deliver(channel({ format: "slack" }), info(), FAST)).ok, true);
    assert.match(receiver.json(0).text, /Orders API is down/);
  });

  it("sends the Discord shape to a Discord channel", async () => {
    await deliver(channel({ format: "discord" }), info(), FAST);

    assert.equal(receiver.json(0).username, "Watchdog");
    assert.deepEqual(receiver.json(0).allowed_mentions, { parse: [] });
  });

  it("signs a generic message that has a secret, and the receiver can verify it", async () => {
    await deliver(channel({ signingSecret: "s3cret" }), info(), FAST);

    const { headers, body } = receiver.requests[0];

    assert.match(headers["x-watchdog-timestamp"], /^\d{10}$/);
    assert.match(headers["x-watchdog-signature"], /^sha256=[0-9a-f]{64}$/);
    assert.equal(headers["x-watchdog-signature"], `sha256=${sign("s3cret", headers["x-watchdog-timestamp"], body)}`);
    assert.notEqual(headers["x-watchdog-signature"], `sha256=${sign("wrong", headers["x-watchdog-timestamp"], body)}`);
  });

  it("adds a timestamp but no signature to a generic message without a secret", async () => {
    await deliver(channel(), info(), FAST);

    assert.match(receiver.requests[0].headers["x-watchdog-timestamp"], /^\d{10}$/);
    assert.equal(receiver.requests[0].headers["x-watchdog-signature"], undefined);
  });

  it("introduces itself to Discord the way Discord expects, so Cloudflare does not block it", async () => {
    await deliver(channel({ format: "discord" }), info(), FAST);

    assert.match(receiver.requests[0].headers["user-agent"], /^DiscordBot \(https?:\/\/\S+, [\d.]+\)$/);
  });

  it("keeps its own name for Slack and generic channels", async () => {
    await deliver(channel({ format: "slack" }), info(), FAST);
    await deliver(channel(), info(), FAST);

    for (const request of receiver.requests) {
      assert.match(request.headers["user-agent"], /^WatchdogBot\//);
    }
  });

  it("passes on the reason the service gives, not just the number", async () => {
    receiver.behavior.defaultStatus = 429;
    receiver.behavior.body = JSON.stringify({ message: "You are being rate limited.", retry_after: 4.2 });

    const outcome = await deliver(channel(), info(), { ...FAST, retry: false });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.error, "HTTP 429: You are being rate limited. (retry in 5s)");
  });

  it("says plainly when something blocked the request before the service saw it", async () => {
    receiver.behavior.defaultStatus = 429;
    receiver.behavior.body = "<html><title>Access denied | Cloudflare</title>error code: 1015</html>";

    const outcome = await deliver(channel(), info(), { ...FAST, retry: false });

    assert.equal(outcome.error, "HTTP 429: blocked before reaching the service, not a message limit");
  });

  it("falls back to the bare number when the answer explains nothing", async () => {
    receiver.behavior.defaultStatus = 400;
    receiver.behavior.body = "";

    assert.equal((await deliver(channel(), info(), FAST)).error, "HTTP 400");

    receiver.behavior.body = "{not json";
    assert.equal((await deliver(channel(), info(), FAST)).error, "HTTP 400");
  });

  it("sends neither a signature nor a timestamp to Slack or Discord", async () => {
    await deliver(channel({ format: "slack", signingSecret: "leftover" }), info(), FAST);
    await deliver(channel({ format: "discord", signingSecret: "leftover" }), info(), FAST);

    for (const request of receiver.requests) {
      assert.equal(request.headers["x-watchdog-signature"], undefined);
      assert.equal(request.headers["x-watchdog-timestamp"], undefined);
    }
  });

  it("does not retry an answer that retrying cannot fix", async () => {
    for (const status of [400, 401, 403, 404, 410]) {
      receiver.requests.length = 0;
      receiver.behavior.defaultStatus = status;

      const outcome = await deliver(channel(), info(), FAST);

      assert.deepEqual(outcome, { ok: false, statusCode: status, error: `HTTP ${status}`, attempts: 1 });
      assert.equal(receiver.requests.length, 1, `status ${status}`);
    }
  });

  it("tries a second time after a server error and succeeds if that works", async () => {
    receiver.behavior.statuses = [500, 204];

    const outcome = await deliver(channel(), info(), FAST);

    assert.deepEqual(outcome, { ok: true, statusCode: 204, error: "", attempts: 2 });
    assert.equal(receiver.requests.length, 2);
  });

  it("gives up after the second try and reports the last answer", async () => {
    receiver.behavior.statuses = [503, 502];

    const outcome = await deliver(channel(), info(), FAST);

    assert.deepEqual(outcome, { ok: false, statusCode: 502, error: "HTTP 502", attempts: 2 });
    assert.equal(receiver.requests.length, 2);
  });

  it("tries a second time after too many requests", async () => {
    receiver.behavior.statuses = [429, 204];

    const outcome = await deliver(channel(), info(), FAST);

    assert.equal(outcome.ok, true);
    assert.equal(outcome.attempts, 2);
  });

  it("never sends more than two requests for one message", async () => {
    receiver.behavior.defaultStatus = 500;

    await deliver(channel(), info(), FAST);

    assert.equal(receiver.requests.length, 2);
  });

  it("waits between the two tries", async () => {
    receiver.behavior.statuses = [500, 204];
    const started = Date.now();

    await deliver(channel(), info(), { ...FAST, retryDelayMs: 150 });

    assert.equal(Date.now() - started >= 140, true);
  });

  it("does not retry when asked not to", async () => {
    receiver.behavior.defaultStatus = 500;

    const outcome = await deliver(channel(), info(), { ...FAST, retry: false });

    assert.equal(outcome.attempts, 1);
    assert.equal(receiver.requests.length, 1);
  });

  it("does not follow a redirect, so a webhook cannot be bounced to another address", async () => {
    receiver.behavior.defaultStatus = 302;

    const outcome = await deliver(channel(), info(), FAST);

    assert.equal(outcome.ok, false);
    assert.equal(outcome.statusCode, 302);
    assert.match(outcome.error, /Redirects are not followed \(HTTP 302\)/);
    assert.equal(outcome.attempts, 1);
    assert.equal(receiver.requests.length, 1);
    assert.equal(receiver.requests.some((request) => request.url === "/elsewhere"), false);
  });

  it("reports an address nobody is listening on, after the second try", async () => {
    const port = await freePort();
    const outcome = await deliver(channel({ url: `http://127.0.0.1:${port}/hook` }), info(), FAST);

    assert.deepEqual(outcome, { ok: false, statusCode: null, error: "Connection refused", attempts: 2 });
  });

  it("gives up on a receiver that is too slow", async () => {
    receiver.behavior.delayMs = 1500;

    const outcome = await deliver(channel(), info(), { retryDelayMs: 0, timeoutMs: 250 });

    assert.equal(outcome.ok, false);
    assert.equal(outcome.statusCode, null);
    assert.equal(outcome.error, "Timed out after 250 ms");
  });

  it("never puts the webhook address or its secret path into an error", async () => {
    const port = await freePort();
    const outcome = await deliver(channel({ url: `http://127.0.0.1:${port}${SECRET_PATH}?key=hunter2` }), info(), FAST);

    assert.equal(outcome.ok, false);
    assert.equal(outcome.error.includes("SECRETTOKEN"), false);
    assert.equal(outcome.error.includes("hunter2"), false);
    assert.equal(outcome.error.includes(String(port) + SECRET_PATH), false);
  });

  it("refuses to call a private address in production, without sending anything and without retrying", async () => {
    const saved = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";

      const outcome = await deliver(channel(), info(), FAST);

      assert.deepEqual(outcome, { ok: false, statusCode: null, error: "Private addresses are not allowed", attempts: 1 });
      assert.equal(receiver.requests.length, 0);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it("refuses a host name that resolves to a private address in production", async () => {
    const saved = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";

      const outcome = await deliver(channel({ url: `http://localhost:${receiver.port}/hook` }), info(), FAST);

      assert.equal(outcome.ok, false);
      assert.equal(outcome.error, "Private addresses are not allowed");
      assert.equal(receiver.requests.length, 0);
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it("refuses the cloud metadata address in production", async () => {
    const saved = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";

      const outcome = await deliver(channel({ url: "http://169.254.169.254/latest/meta-data" }), info(), FAST);

      assert.equal(outcome.error, "Private addresses are not allowed");
    } finally {
      process.env.NODE_ENV = saved;
    }
  });
});

describe("sendTest", () => {
  let receiver;
  let memory;

  before(async () => {
    receiver = await startReceiver();
  });

  after(async () => {
    await receiver.close();
  });

  beforeEach(() => {
    memory = installMemoryApp();
    receiver.requests.length = 0;
    receiver.behavior.statuses = [];
    receiver.behavior.defaultStatus = 204;
  });

  afterEach(() => memory.restore());

  const make = (extra = {}) => WebhookChannel.create({ user: oid(), name: "Ops", format: "generic", url: `${receiver.base}/hook`, ...extra });

  it("sends a test message and records that it was delivered", async () => {
    const channel = await make();
    const outcome = await sendTest(channel, FAST);

    assert.equal(outcome.ok, true);
    assert.equal(receiver.json(0).event, "test");
    assert.equal(channel.lastDelivery.event, "test");
    assert.equal(channel.lastDelivery.ok, true);
    assert.equal(channel.lastDelivery.statusCode, 204);
    assert.equal(channel.lastDelivery.error, "");
    assert.equal(channel.lastDelivery.at instanceof Date, true);
  });

  it("does not retry a failed test and records the reason", async () => {
    receiver.behavior.defaultStatus = 500;

    const channel = await make();
    const outcome = await sendTest(channel, FAST);

    assert.equal(outcome.ok, false);
    assert.equal(receiver.requests.length, 1);
    assert.equal(channel.lastDelivery.ok, false);
    assert.equal(channel.lastDelivery.statusCode, 500);
    assert.equal(channel.lastDelivery.error, "HTTP 500");
  });

  it("sends a test even to a paused channel, because the person asked", async () => {
    const channel = await make({ isActive: false });

    assert.equal((await sendTest(channel, FAST)).ok, true);
  });
});

describe("notifyIncident", () => {
  let receiver;
  let other;
  let memory;

  before(async () => {
    receiver = await startReceiver();
    other = await startReceiver();
  });

  after(async () => {
    await receiver.close();
    await other.close();
  });

  beforeEach(() => {
    memory = installMemoryApp();

    for (const server of [receiver, other]) {
      server.requests.length = 0;
      server.behavior.statuses = [];
      server.behavior.defaultStatus = 204;
    }
  });

  afterEach(() => memory.restore());

  const owner = oid();
  const make = (extra = {}) => WebhookChannel.create({ user: owner, name: "Channel", format: "generic", url: `${receiver.base}/hook`, ...extra });

  it("sends to every active channel of the monitor's owner, in each channel's own format", async () => {
    await make({ format: "slack", url: `${receiver.base}/slack` });
    await make({ format: "discord", url: `${receiver.base}/discord` });
    await make({ format: "generic", url: `${receiver.base}/generic` });

    await notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST);

    const byPath = Object.fromEntries(receiver.requests.map((request) => [request.url, JSON.parse(request.body)]));

    assert.deepEqual(Object.keys(byPath).sort(), ["/discord", "/generic", "/slack"]);
    assert.match(byPath["/slack"].text, /Orders API is down/);
    assert.equal(byPath["/discord"].username, "Watchdog");
    assert.equal(byPath["/generic"].event, "incident.opened");
  });

  it("skips paused channels and other people's channels", async () => {
    await make({ url: `${receiver.base}/mine` });
    await make({ url: `${receiver.base}/paused`, isActive: false });
    await WebhookChannel.create({ user: oid(), name: "Stranger", format: "generic", url: `${other.base}/theirs` });

    await notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST);

    assert.deepEqual(receiver.requests.map((request) => request.url), ["/mine"]);
    assert.equal(other.requests.length, 0);
  });

  it("sends the recovery with the duration", async () => {
    await make();

    await notifyIncident("resolved", resolvedIncident(), monitor({ user: owner }), FAST);

    assert.equal(receiver.json(0).event, "incident.resolved");
    assert.equal(receiver.json(0).incident.durationMs, 14 * 60 * 1000);
  });

  it("records what happened on each channel", async () => {
    const good = await make({ url: `${receiver.base}/good` });
    const bad = await make({ url: `${other.base}/bad` });
    other.behavior.defaultStatus = 404;

    await quiet(() => notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST));

    assert.equal(good.lastDelivery.ok, true);
    assert.equal(good.lastDelivery.event, "incident.opened");
    assert.equal(bad.lastDelivery.ok, false);
    assert.equal(bad.lastDelivery.statusCode, 404);
    assert.equal(bad.lastDelivery.error, "HTTP 404");
  });

  it("lets a broken channel fail without stopping the others", async () => {
    const port = await freePort();
    await make({ url: `http://127.0.0.1:${port}/dead` });
    const alive = await make({ url: `${receiver.base}/alive` });

    await quiet(() => notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST));

    assert.equal(receiver.requests.length, 1);
    assert.equal(alive.lastDelivery.ok, true);
  });

  it("logs a failure without the webhook address", async () => {
    const port = await freePort();
    await make({ url: `http://127.0.0.1:${port}${SECRET_PATH}` });
    const lines = [];
    const original = console.log;

    console.log = (...args) => lines.push(args.join(" "));

    try {
      await notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST);
    } finally {
      console.log = original;
    }

    assert.equal(lines.length >= 1, true);
    assert.match(lines[0], /Alert incident\.opened to channel .* failed: Connection refused/);
    assert.equal(lines.join("\n").includes("SECRETTOKEN"), false);
    assert.equal(lines.join("\n").includes(String(port)), false);
  });

  it("sends nothing when the owner has no channels", async () => {
    await notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST);

    assert.equal(receiver.requests.length, 0);
  });

  it("ignores events that are not a new outage or a recovery", async () => {
    await make();

    await notifyIncident("updated", openedIncident(), monitor({ user: owner }), FAST);
    await notifyIncident(undefined, openedIncident(), monitor({ user: owner }), FAST);
    await notifyIncident("test", openedIncident(), monitor({ user: owner }), FAST);

    assert.equal(receiver.requests.length, 0);
  });

  it("never throws, even when the database is down, and says so in the log", async () => {
    const restore = stub(WebhookChannel, "find", () => {
      throw new Error("database is down");
    });
    const lines = [];
    const original = console.log;

    console.log = (...args) => lines.push(args.join(" "));

    try {
      await assert.doesNotReject(notifyIncident("opened", openedIncident(), monitor({ user: owner }), FAST));
    } finally {
      console.log = original;
      restore();
    }

    assert.match(lines.join("\n"), /Alert delivery failed: database is down/);
  });

  it("sends to the three channels at the same time, not one after the other", async () => {
    receiver.behavior.delayMs = 300;

    await make({ url: `${receiver.base}/a` });
    await make({ url: `${receiver.base}/b` });
    await make({ url: `${receiver.base}/c` });

    const started = Date.now();
    await notifyIncident("opened", openedIncident(), monitor({ user: owner }), { ...FAST, timeoutMs: 2000 });

    assert.equal(receiver.requests.length, 3);
    assert.equal(Date.now() - started < 800, true, "took as long as three in a row");
  });
});
