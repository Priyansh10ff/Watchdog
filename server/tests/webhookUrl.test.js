import "./helpers/env.js";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { WEBHOOK_FORMATS, maskUrl, validateWebhookUrl } from "../utils/webhookUrl.js";

const original = process.env.NODE_ENV;
const production = () => {
  process.env.NODE_ENV = "production";
};

afterEach(() => {
  process.env.NODE_ENV = original;
});

describe("webhook formats", () => {
  it("are slack, discord and generic", () => {
    assert.deepEqual(WEBHOOK_FORMATS, ["slack", "discord", "generic"]);
  });
});

describe("validateWebhookUrl outside production", () => {
  it("accepts http and https addresses, including local ones, so it can be tested locally", () => {
    for (const url of ["http://localhost:4000/hook", "http://127.0.0.1:9/x", "https://example.com/hook"]) {
      assert.equal(validateWebhookUrl(url, "generic").valid, true, url);
    }
  });

  it("does not apply the Slack and Discord host rules", () => {
    assert.equal(validateWebhookUrl("http://localhost:4000/anything", "slack").valid, true);
    assert.equal(validateWebhookUrl("http://localhost:4000/anything", "discord").valid, true);
  });

  it("trims the value and drops a fragment", () => {
    const result = validateWebhookUrl("  https://example.com/hook#top  ", "generic");

    assert.equal(result.url, "https://example.com/hook");
  });

  it("refuses missing, empty and non-text values", () => {
    for (const value of [undefined, null, "", "   ", 42, {}, []]) {
      const result = validateWebhookUrl(value, "generic");

      assert.equal(result.valid, false);
      assert.equal(result.message, "Webhook URL is required");
    }
  });

  it("refuses an address longer than 500 characters", () => {
    const result = validateWebhookUrl(`https://example.com/${"a".repeat(500)}`, "generic");

    assert.equal(result.valid, false);
    assert.equal(result.message, "Webhook URL is too long");
  });

  it("refuses other schemes, credentials and text that is not an address", () => {
    assert.equal(validateWebhookUrl("ftp://example.com/hook", "generic").valid, false);
    assert.equal(validateWebhookUrl("javascript:alert(1)", "generic").valid, false);
    assert.equal(validateWebhookUrl("https://user:pass@example.com/hook", "generic").valid, false);
    assert.equal(validateWebhookUrl("not a url", "generic").valid, false);
  });
});

describe("validateWebhookUrl in production", () => {
  it("requires https", () => {
    production();
    const result = validateWebhookUrl("http://example.com/hook", "generic");

    assert.equal(result.valid, false);
    assert.equal(result.message, "Webhook URLs must use https");
  });

  it("refuses private and local addresses", () => {
    production();

    for (const url of ["https://localhost/hook", "https://127.0.0.1/hook", "https://10.0.0.5/hook", "https://192.168.1.4/hook", "https://169.254.169.254/latest"]) {
      const result = validateWebhookUrl(url, "generic");

      assert.equal(result.valid, false, url);
      assert.equal(result.message, "Private and local addresses are not allowed");
    }
  });

  it("accepts any public https address for the generic format", () => {
    production();

    assert.equal(validateWebhookUrl("https://hooks.example.org/in/abc", "generic").valid, true);
  });

  it("accepts real Slack webhook shapes and nothing else for the Slack format", () => {
    production();

    for (const url of ["https://hooks.slack.com/services/T000/B000/XXXX", "https://hooks.slack.com/triggers/T000/1/abc", "https://hooks.slack.com/workflows/T000/A1/9"]) {
      assert.equal(validateWebhookUrl(url, "slack").valid, true, url);
    }

    for (const url of ["https://hooks.slack.com/other/path", "https://evil.example.com/services/T000/B000/XXXX", "https://hooks.slack.com.evil.example/services/T0/B0/X", "https://slack.com/services/T0/B0/X"]) {
      const result = validateWebhookUrl(url, "slack");

      assert.equal(result.valid, false, url);
      assert.equal(result.message, "Slack webhooks start with https://hooks.slack.com/services/");
    }
  });

  it("accepts real Discord webhook shapes and nothing else for the Discord format", () => {
    production();

    for (const url of ["https://discord.com/api/webhooks/123/abc", "https://discordapp.com/api/webhooks/1/x", "https://ptb.discord.com/api/webhooks/1/x", "https://canary.discord.com/api/webhooks/1/x"]) {
      assert.equal(validateWebhookUrl(url, "discord").valid, true, url);
    }

    for (const url of ["https://discord.com/other", "https://evil.example.com/api/webhooks/1/x", "https://discord.com.evil.example/api/webhooks/1/x", "https://cdn.discord.com/api/webhooks/1/x"]) {
      const result = validateWebhookUrl(url, "discord");

      assert.equal(result.valid, false, url);
      assert.equal(result.message, "Discord webhooks start with https://discord.com/api/webhooks/");
    }
  });

  it("does not let a Slack address pass as a Discord webhook or the other way round", () => {
    production();

    assert.equal(validateWebhookUrl("https://hooks.slack.com/services/T0/B0/X", "discord").valid, false);
    assert.equal(validateWebhookUrl("https://discord.com/api/webhooks/1/x", "slack").valid, false);
  });
});

describe("maskUrl", () => {
  it("shows the host and only the last four characters", () => {
    assert.equal(maskUrl("https://hooks.slack.com/services/T000/B000/abcdWXYZ"), "https://hooks.slack.com/…WXYZ");
  });

  it("keeps a port", () => {
    assert.equal(maskUrl("http://127.0.0.1:4000/secret/token1234"), "http://127.0.0.1:4000/…1234");
  });

  it("never contains the path in front of the last four characters", () => {
    const masked = maskUrl("https://hooks.slack.com/services/T000/B000/SECRETTOKEN");

    assert.equal(masked.includes("services"), false);
    assert.equal(masked.includes("SECRET"), false);
  });

  it("gives an empty text for anything that is not an address", () => {
    for (const value of [undefined, null, "", "nope"]) assert.equal(maskUrl(value), "");
  });
});
