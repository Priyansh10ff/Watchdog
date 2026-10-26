import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  CHANNEL_FORMATS,
  NAME_MAX,
  describeDelivery,
  formatLabel,
  urlHint,
  urlPlaceholder,
  validateChannelForm,
} from "../src/utils/webhookForm.js";

const NOW = new Date("2026-10-11T12:00:00.000Z").getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

describe("channel formats", () => {
  it("offer Slack, Discord and a generic webhook, in that order", () => {
    assert.deepEqual(CHANNEL_FORMATS.map((item) => item.value), ["slack", "discord", "generic"]);
    assert.deepEqual(CHANNEL_FORMATS.map((item) => item.label), ["Slack", "Discord", "Webhook (JSON)"]);
  });

  it("have a label for each value and a fallback for anything else", () => {
    assert.equal(formatLabel("slack"), "Slack");
    assert.equal(formatLabel("discord"), "Discord");
    assert.equal(formatLabel("generic"), "Webhook (JSON)");
    assert.equal(formatLabel("teams"), "Webhook");
    assert.equal(formatLabel(undefined), "Webhook");
  });

  it("have a hint and a placeholder for each, and an empty text for an unknown one", () => {
    for (const { value } of CHANNEL_FORMATS) {
      assert.notEqual(urlHint(value), "");
      assert.match(urlPlaceholder(value), /^https:\/\//);
    }

    assert.equal(urlHint("teams"), "");
    assert.equal(urlPlaceholder("teams"), "");
  });

  it("say where to find the address and what it starts with", () => {
    assert.match(urlHint("slack"), /Incoming Webhook/);
    assert.match(urlHint("slack"), /https:\/\/hooks\.slack\.com\/services\//);
    assert.match(urlHint("discord"), /Integrations/);
    assert.match(urlHint("discord"), /https:\/\/discord\.com\/api\/webhooks\//);
    assert.match(urlHint("generic"), /signed JSON/);
  });
});

describe("validateChannelForm", () => {
  const good = { name: "Team chat", format: "slack", url: "https://hooks.slack.com/services/T0/B0/X" };

  it("accepts a complete form", () => {
    assert.equal(validateChannelForm(good), "");
  });

  it("accepts http, which the server allows outside production", () => {
    assert.equal(validateChannelForm({ ...good, url: "http://localhost:4000/hook" }), "");
  });

  it("asks for a name of 1 to 40 characters", () => {
    const message = `Name must be 1 to ${NAME_MAX} characters`;

    for (const name of [undefined, null, "", "   ", "n".repeat(NAME_MAX + 1)]) {
      assert.equal(validateChannelForm({ ...good, name }), message, JSON.stringify(name));
    }

    assert.equal(validateChannelForm({ ...good, name: "n".repeat(NAME_MAX) }), "");
    assert.equal(validateChannelForm({ ...good, name: "  Ops  " }), "");
  });

  it("asks for the address when it is empty", () => {
    for (const url of [undefined, null, "", "   "]) {
      assert.equal(validateChannelForm({ ...good, url }), "Paste the webhook URL", JSON.stringify(url));
    }
  });

  it("explains text that is not an address", () => {
    assert.equal(validateChannelForm({ ...good, url: "hooks.slack.com/services/x" }), "That does not look like a web address");
    assert.equal(validateChannelForm({ ...good, url: "not a url" }), "That does not look like a web address");
  });

  it("refuses other schemes and credentials", () => {
    assert.equal(validateChannelForm({ ...good, url: "ftp://example.com/x" }), "The address must start with https://");
    assert.equal(validateChannelForm({ ...good, url: "javascript:alert(1)" }), "The address must start with https://");
    assert.equal(validateChannelForm({ ...good, url: "https://user:pw@example.com/x" }), "Do not put credentials in the address");
  });

  it("checks the name before the address", () => {
    assert.equal(validateChannelForm({ name: "", url: "" }), `Name must be 1 to ${NAME_MAX} characters`);
  });
});

describe("describeDelivery", () => {
  beforeEach(() => {
    mock.timers.enable({ apis: ["Date"], now: NOW });
  });

  afterEach(() => {
    mock.timers.reset();
  });

  it("tells a new channel to send a test", () => {
    assert.deepEqual(describeDelivery(null), { tone: "none", text: "No message sent yet. Use Send test to check that it works." });
    assert.equal(describeDelivery(undefined).tone, "none");
  });

  it("reports a delivered test message and says how long ago", () => {
    assert.deepEqual(describeDelivery({ at: ago(5 * 60000), event: "test", ok: true, statusCode: 204, error: "" }), {
      tone: "ok",
      text: "Last test message delivered 5 min ago",
    });
  });

  it("names the kind of message", () => {
    const text = (event) => describeDelivery({ at: ago(3 * 3600000), event, ok: true }).text;

    assert.equal(text("incident.opened"), "Last outage message delivered 3 hr ago");
    assert.equal(text("incident.resolved"), "Last recovery message delivered 3 hr ago");
    assert.equal(text("something.else"), "Last message delivered 3 hr ago");
    assert.equal(text(undefined), "Last message delivered 3 hr ago");
  });

  it("says just now for something under a minute ago", () => {
    assert.equal(describeDelivery({ at: ago(20000), event: "test", ok: true }).text, "Last test message delivered just now");
  });

  it("reports a failure with its reason", () => {
    assert.deepEqual(describeDelivery({ at: ago(2 * 60000), event: "incident.opened", ok: false, statusCode: 404, error: "HTTP 404" }), {
      tone: "fail",
      text: "Last outage message failed 2 min ago: HTTP 404",
    });
  });

  it("falls back to the status code and then to no answer when there is no reason", () => {
    assert.match(describeDelivery({ at: ago(60000), event: "test", ok: false, statusCode: 500, error: "" }).text, /failed 1 min ago: HTTP 500$/);
    assert.match(describeDelivery({ at: ago(60000), event: "test", ok: false, statusCode: null, error: "" }).text, /failed 1 min ago: no answer$/);
    assert.match(describeDelivery({ at: ago(60000), event: "test", ok: false }).text, /no answer$/);
  });

  it("uses days for old messages", () => {
    assert.equal(describeDelivery({ at: ago(2 * 86400000), event: "test", ok: true }).text, "Last test message delivered 2 days ago");
    assert.equal(describeDelivery({ at: ago(86400000), event: "test", ok: true }).text, "Last test message delivered 1 day ago");
  });
});
