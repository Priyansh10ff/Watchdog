import "./helpers/env.js";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
import { cookieFor } from "./helpers/stubs.js";
import { startReceiver } from "./helpers/server.js";
import { installMemoryApp } from "./helpers/memoryApp.js";

const { default: app } = await import("../app.js");

const SECRET = "SECRETTOKEN9";

let server;
let base;
let memory;
let receiver;
let alice;
let bob;

const call = async (method, path, { body, user = alice } = {}) => {
  const response = await fetch(`${base}/api/webhooks${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(user ? { Cookie: cookieFor(user._id) } : {}),
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await response.text();

  return { status: response.status, text, json: text ? JSON.parse(text) : null };
};

const goodBody = (extra = {}) => ({ name: "Team chat", format: "generic", url: `${receiver.base}/hook/${SECRET}`, ...extra });
const add = async (extra = {}, user = alice) => (await call("POST", "", { body: goodBody(extra), user })).json;

before(async () => {
  receiver = await startReceiver();
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
  await receiver.close();
});

beforeEach(async () => {
  memory = installMemoryApp();
  alice = await User.create({ name: "Alice", email: "alice@example.com", password: "x" });
  bob = await User.create({ name: "Bob", email: "bob@example.com", password: "x" });
  receiver.requests.length = 0;
  receiver.behavior.statuses = [];
  receiver.behavior.defaultStatus = 204;
});

afterEach(() => memory.restore());

describe("who may use the alert channels", () => {
  it("refuses every route without a login", async () => {
    const id = "64b64b64b64b64b64b64b64b";
    const attempts = [
      call("GET", "", { user: null }),
      call("POST", "", { body: goodBody(), user: null }),
      call("PATCH", `/${id}`, { body: { name: "x" }, user: null }),
      call("DELETE", `/${id}`, { user: null }),
      call("POST", `/${id}/test`, { user: null }),
    ];

    for (const result of await Promise.all(attempts)) {
      assert.equal(result.status, 401);
      assert.equal(result.json.success, false);
    }
  });
});

describe("adding a channel", () => {
  it("creates a generic channel and hands out its signing secret, once", async () => {
    const result = await call("POST", "", { body: goodBody() });

    assert.equal(result.status, 201);
    assert.equal(result.json.success, true);
    assert.equal(result.json.message, "Alert channel added");
    assert.match(result.json.signingSecret, /^[0-9a-f]{48}$/);
    assert.equal(result.json.channel.name, "Team chat");
    assert.equal(result.json.channel.format, "generic");
    assert.equal(result.json.channel.isActive, true);
    assert.equal(result.json.channel.lastDelivery, null);
  });

  it("gives Slack and Discord channels no signing secret", async () => {
    for (const format of ["slack", "discord"]) {
      const result = await call("POST", "", { body: goodBody({ format }) });

      assert.equal(result.status, 201);
      assert.equal("signingSecret" in result.json, false, format);
      assert.equal(memory.db.channels.at(-1).signingSecret, "");
    }
  });

  it("never sends the address back, only a masked preview", async () => {
    const result = await call("POST", "", { body: goodBody() });

    assert.equal(result.text.includes(SECRET), false);
    assert.equal(result.text.includes("/hook/"), false);
    assert.equal("url" in result.json.channel, false);
    assert.match(result.json.channel.urlPreview, /^http:\/\/127\.0\.0\.1:\d+\/…KEN9$/);
  });

  it("stores the address, a trimmed name and the owner, and ignores anything else sent", async () => {
    const result = await call("POST", "", {
      body: goodBody({ name: "  Ops room  ", user: bob._id, lastDelivery: { ok: true }, signingSecret: "mine", _id: "x", isActive: false }),
    });
    const stored = memory.db.channels[0];

    assert.equal(result.status, 201);
    assert.equal(stored.name, "Ops room");
    assert.equal(String(stored.user), String(alice._id));
    assert.equal(stored.url, `${receiver.base}/hook/${SECRET}`);
    assert.equal(stored.lastDelivery, undefined);
    assert.notEqual(stored.signingSecret, "mine");
    assert.equal(stored.isActive, false);
    assert.notEqual(String(stored._id), "x");
  });

  it("refuses a missing or wrong name", async () => {
    for (const name of [undefined, "", "   ", 42, {}, "n".repeat(41)]) {
      const result = await call("POST", "", { body: goodBody({ name }) });

      assert.equal(result.status, 400, JSON.stringify(name));
      assert.equal(result.json.message, "Name must be 1 to 40 characters");
    }

    assert.equal((await call("POST", "", { body: goodBody({ name: "n".repeat(40) }) })).status, 201);
  });

  it("refuses a missing or unknown format, including values that are not text", async () => {
    for (const format of [undefined, "", "teams", "SLACK", 1, null, {}, ["slack"]]) {
      const result = await call("POST", "", { body: goodBody({ format }) });

      assert.equal(result.status, 400, JSON.stringify(format));
      assert.equal(result.json.message, "Format must be slack, discord or generic");
    }
  });

  it("refuses a missing or bad address", async () => {
    const bad = [undefined, "", "   ", 42, {}, [], "nope", "ftp://example.com/x", "https://user:pw@example.com/x", `https://example.com/${"a".repeat(500)}`];

    for (const url of bad) {
      const result = await call("POST", "", { body: goodBody({ url }) });

      assert.equal(result.status, 400, JSON.stringify(url));
      assert.equal(result.json.success, false);
    }

    assert.equal(memory.db.channels.length, 0);
  });

  it("refuses an empty body and invalid JSON", async () => {
    assert.equal((await call("POST", "", { body: {} })).status, 400);
    assert.equal((await call("POST", "", { body: "{broken" })).status, 400);
  });

  it("allows three channels per account and no more, counted for each account separately", async () => {
    for (let n = 0; n < 3; n += 1) assert.equal((await call("POST", "", { body: goodBody({ name: `c${n}` }) })).status, 201);

    const fourth = await call("POST", "", { body: goodBody({ name: "c4" }) });

    assert.equal(fourth.status, 403);
    assert.equal(fourth.json.message, "You can have at most 3 alert channels");
    assert.equal((await call("POST", "", { body: goodBody(), user: bob })).status, 201);
  });

  it("checks the address and the limit before creating anything", async () => {
    await call("POST", "", { body: goodBody({ url: "nope" }) });

    assert.equal(memory.db.channels.length, 0);
  });
});

describe("the rules in production", () => {
  const saved = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = saved;
  });

  const inProduction = async (body) => {
    process.env.NODE_ENV = "production";
    return call("POST", "", { body });
  };

  it("requires https and refuses private addresses", async () => {
    assert.equal((await inProduction(goodBody({ url: "http://example.com/hook" }))).json.message, "Webhook URLs must use https");
    assert.equal((await inProduction(goodBody({ url: "https://127.0.0.1/hook" }))).json.message, "Private and local addresses are not allowed");
    assert.equal((await inProduction(goodBody({ url: "https://169.254.169.254/hook" }))).status, 400);
  });

  it("accepts any public https address for the generic format", async () => {
    assert.equal((await inProduction(goodBody({ url: "https://hooks.example.org/in/abc" }))).status, 201);
  });

  it("checks that a Slack channel really points at Slack", async () => {
    assert.equal((await inProduction(goodBody({ format: "slack", url: "https://hooks.example.org/services/T0/B0/X" }))).status, 400);
    assert.equal((await inProduction(goodBody({ format: "slack", url: "https://hooks.slack.com/services/T0/B0/X" }))).status, 201);
  });

  it("checks that a Discord channel really points at Discord", async () => {
    assert.equal((await inProduction(goodBody({ format: "discord", url: "https://hooks.example.org/api/webhooks/1/x" }))).status, 400);
    assert.equal((await inProduction(goodBody({ format: "discord", url: "https://discord.com/api/webhooks/1/x" }))).status, 201);
  });
});

describe("listing the channels", () => {
  it("lists only the caller's channels, oldest first, with the limit", async () => {
    await add({ name: "first" });
    await add({ name: "second" });
    await add({ name: "bobs" }, bob);

    const result = await call("GET", "");

    assert.equal(result.status, 200);
    assert.equal(result.json.count, 2);
    assert.equal(result.json.limit, 3);
    assert.deepEqual(result.json.channels.map((channel) => channel.name), ["first", "second"]);
  });

  it("is empty for someone with no channels", async () => {
    const result = await call("GET", "");

    assert.deepEqual(result.json, { success: true, count: 0, limit: 3, channels: [] });
  });

  it("never shows an address or a signing secret", async () => {
    const created = await add();
    const result = await call("GET", "");

    assert.equal(result.text.includes(SECRET), false);
    assert.equal(result.text.includes(created.signingSecret), false);
    assert.equal(result.text.includes("signingSecret"), false);
    assert.equal(result.text.includes('"url"'), false);
    assert.match(result.json.channels[0].urlPreview, /…KEN9$/);
  });
});

describe("changing a channel", () => {
  it("renames a channel and pauses it and resumes it", async () => {
    const { channel } = await add();

    const renamed = await call("PATCH", `/${channel._id}`, { body: { name: "  New name " } });
    const paused = await call("PATCH", `/${channel._id}`, { body: { isActive: false } });
    const resumed = await call("PATCH", `/${channel._id}`, { body: { isActive: true } });

    assert.equal(renamed.json.channel.name, "New name");
    assert.equal(paused.json.channel.isActive, false);
    assert.equal(resumed.json.channel.isActive, true);
    assert.equal(renamed.json.message, "Alert channel updated");
  });

  it("refuses an empty change and bad values", async () => {
    const { channel } = await add();

    assert.equal((await call("PATCH", `/${channel._id}`, { body: {} })).json.message, "Nothing to update");
    assert.equal((await call("PATCH", `/${channel._id}`, { body: { name: "" } })).status, 400);
    assert.equal((await call("PATCH", `/${channel._id}`, { body: { name: "n".repeat(41) } })).status, 400);
    assert.equal((await call("PATCH", `/${channel._id}`, { body: { format: "teams" } })).status, 400);
    assert.equal((await call("PATCH", `/${channel._id}`, { body: { url: "nope" } })).status, 400);
    assert.equal((await call("PATCH", `/${channel._id}`, { body: { isActive: "yes" } })).json.message, "isActive must be true or false");
    assert.equal((await call("PATCH", `/${channel._id}`, { body: { isActive: 1 } })).status, 400);
  });

  it("changes the address, forgets the last delivery of the old one and hides the new one", async () => {
    const { channel } = await add();
    await call("POST", `/${channel._id}/test`);

    assert.equal((await call("GET", "")).json.channels[0].lastDelivery.ok, true);

    const result = await call("PATCH", `/${channel._id}`, { body: { url: `${receiver.base}/new/NEWTOKEN77` } });

    assert.equal(result.status, 200);
    assert.equal(result.json.channel.lastDelivery, null);
    assert.equal(result.text.includes("NEWTOKEN77"), false);
    assert.equal(memory.db.channels[0].url, `${receiver.base}/new/NEWTOKEN77`);
  });

  it("keeps the last delivery when the address stays the same", async () => {
    const { channel } = await add();
    await call("POST", `/${channel._id}/test`);

    const result = await call("PATCH", `/${channel._id}`, { body: { url: `${receiver.base}/hook/${SECRET}`, name: "Same" } });

    assert.equal(result.json.channel.lastDelivery.ok, true);
  });

  it("checks a changed format against the address, and hands out a secret when it becomes generic", async () => {
    const { channel } = await add({ format: "slack" });

    const result = await call("PATCH", `/${channel._id}`, { body: { format: "generic" } });

    assert.equal(result.status, 200);
    assert.match(result.json.signingSecret, /^[0-9a-f]{48}$/);

    const again = await call("PATCH", `/${channel._id}`, { body: { name: "Again" } });

    assert.equal("signingSecret" in again.json, false);
  });

  it("applies the production rules to a changed address", async () => {
    const saved = process.env.NODE_ENV;
    const { channel } = await add();

    try {
      process.env.NODE_ENV = "production";
      const result = await call("PATCH", `/${channel._id}`, { body: { url: "http://example.com/hook" } });

      assert.equal(result.status, 400);
      assert.equal(result.json.message, "Webhook URLs must use https");
    } finally {
      process.env.NODE_ENV = saved;
    }
  });

  it("ignores fields that are not editable", async () => {
    const { channel } = await add();
    const stored = memory.db.channels[0];

    await call("PATCH", `/${channel._id}`, {
      body: { name: "Only this", user: bob._id, signingSecret: "mine", lastDelivery: { ok: false }, _id: "x", createdAt: "2000-01-01" },
    });

    assert.equal(stored.name, "Only this");
    assert.equal(String(stored.user), String(alice._id));
    assert.notEqual(stored.signingSecret, "mine");
    assert.equal(stored.lastDelivery, undefined);
  });

  it("does not find someone else's channel or a malformed id", async () => {
    const { channel } = await add({}, bob);

    const foreign = await call("PATCH", `/${channel._id}`, { body: { name: "Mine now" } });
    const malformed = await call("PATCH", "/not-an-id", { body: { name: "x" } });

    assert.equal(foreign.status, 404);
    assert.equal(foreign.json.message, "Alert channel not found");
    assert.equal(malformed.status, 404);
    assert.equal(memory.db.channels[0].name, "Team chat");
  });
});

describe("deleting a channel", () => {
  it("removes it", async () => {
    const { channel } = await add();
    const result = await call("DELETE", `/${channel._id}`);

    assert.equal(result.status, 200);
    assert.equal(result.json.message, "Alert channel deleted");
    assert.equal(memory.db.channels.length, 0);
    assert.equal((await call("DELETE", `/${channel._id}`)).status, 404);
  });

  it("leaves other people's channels alone", async () => {
    const { channel } = await add({}, bob);
    const result = await call("DELETE", `/${channel._id}`);

    assert.equal(result.status, 404);
    assert.equal(memory.db.channels.length, 1);
    assert.equal((await call("DELETE", "/not-an-id")).status, 404);
  });

  it("frees a place, so a fourth channel can be added after deleting one", async () => {
    const created = [];

    for (let n = 0; n < 3; n += 1) created.push((await add({ name: `c${n}` })).channel);

    assert.equal((await call("POST", "", { body: goodBody() })).status, 403);
    await call("DELETE", `/${created[0]._id}`);
    assert.equal((await call("POST", "", { body: goodBody() })).status, 201);
  });
});

describe("sending a test message", () => {
  it("sends one, reports the result and shows it in the list", async () => {
    const { channel } = await add();
    const result = await call("POST", `/${channel._id}/test`);

    assert.equal(result.status, 200);
    assert.equal(result.json.message, "Test message sent");
    assert.deepEqual(result.json.delivery, { ok: true, statusCode: 204, error: "" });
    assert.equal(receiver.requests.length, 1);
    assert.equal(receiver.json(0).event, "test");
    assert.equal(receiver.requests[0].url, `/hook/${SECRET}`);

    const listed = (await call("GET", "")).json.channels[0].lastDelivery;

    assert.equal(listed.ok, true);
    assert.equal(listed.event, "test");
    assert.equal(listed.statusCode, 204);
  });

  it("signs a test message to a generic channel with the secret it was given", async () => {
    const created = await add();
    await call("POST", `/${created.channel._id}/test`);

    const { headers, body } = receiver.requests[0];
    const { sign } = await import("../services/alert.service.js");

    assert.equal(headers["x-watchdog-signature"], `sha256=${sign(created.signingSecret, headers["x-watchdog-timestamp"], body)}`);
  });

  it("reports a failed delivery with the reason, and sends only once", async () => {
    receiver.behavior.defaultStatus = 500;

    const { channel } = await add();
    const result = await call("POST", `/${channel._id}/test`);

    assert.equal(result.status, 200);
    assert.equal(result.json.message, "The test message could not be delivered");
    assert.deepEqual(result.json.delivery, { ok: false, statusCode: 500, error: "HTTP 500" });
    assert.equal(receiver.requests.length, 1);
    assert.equal(result.text.includes(SECRET), false);
  });

  it("makes people wait a few seconds between messages", async () => {
    const { channel } = await add();

    assert.equal((await call("POST", `/${channel._id}/test`)).status, 200);

    const second = await call("POST", `/${channel._id}/test`);

    assert.equal(second.status, 429);
    assert.equal(second.json.message, "Wait a few seconds before sending another message");
    assert.equal(receiver.requests.length, 1);
  });

  it("allows another message after the wait", async () => {
    const { channel } = await add();
    await call("POST", `/${channel._id}/test`);

    memory.db.channels[0].lastDelivery.at = new Date(Date.now() - 11000);

    assert.equal((await call("POST", `/${channel._id}/test`)).status, 200);
    assert.equal(receiver.requests.length, 2);
  });

  it("works for a paused channel", async () => {
    const { channel } = await add({ isActive: false });

    assert.equal((await call("POST", `/${channel._id}/test`)).status, 200);
  });

  it("does not find someone else's channel", async () => {
    const { channel } = await add({}, bob);
    const result = await call("POST", `/${channel._id}/test`);

    assert.equal(result.status, 404);
    assert.equal(receiver.requests.length, 0);
    assert.equal((await call("POST", "/not-an-id/test")).status, 404);
  });
});
