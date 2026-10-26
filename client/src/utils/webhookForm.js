import { timeAgo } from "./time.js";

export const NAME_MAX = 40;

export const CHANNEL_FORMATS = [
  { value: "slack", label: "Slack" },
  { value: "discord", label: "Discord" },
  { value: "generic", label: "Webhook (JSON)" },
];

const HINTS = {
  slack:
    "In Slack, add an Incoming Webhook to a channel and paste its URL. It starts with https://hooks.slack.com/services/",
  discord:
    "In Discord, open the channel settings, choose Integrations, then Webhooks, and copy the URL. It starts with https://discord.com/api/webhooks/",
  generic:
    "Watchdog sends a signed JSON message to this address with a POST request. Use a public https address.",
};

const PLACEHOLDERS = {
  slack: "https://hooks.slack.com/services/...",
  discord: "https://discord.com/api/webhooks/...",
  generic: "https://example.com/watchdog-hook",
};

const EVENT_LABELS = {
  test: "test message",
  "incident.opened": "outage message",
  "incident.resolved": "recovery message",
};

export const formatLabel = (format) =>
  CHANNEL_FORMATS.find((item) => item.value === format)?.label ?? "Webhook";

export const urlHint = (format) => HINTS[format] || "";

export const urlPlaceholder = (format) => PLACEHOLDERS[format] || "";

export const validateChannelForm = ({ name, url }) => {
  const trimmed = String(name ?? "").trim();

  if (!trimmed || trimmed.length > NAME_MAX) {
    return `Name must be 1 to ${NAME_MAX} characters`;
  }

  const text = String(url ?? "").trim();

  if (!text) return "Paste the webhook URL";

  let parsed;

  try {
    parsed = new URL(text);
  } catch (error) {
    return "That does not look like a web address";
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return "The address must start with https://";
  }

  if (parsed.username || parsed.password) {
    return "Do not put credentials in the address";
  }

  return "";
};

export const describeDelivery = (delivery) => {
  if (!delivery) {
    return { tone: "none", text: "No message sent yet. Use Send test to check that it works." };
  }

  const label = EVENT_LABELS[delivery.event] || "message";
  const ago = timeAgo(delivery.at);
  const when = ago === "Just now" ? "just now" : ago;

  if (delivery.ok) {
    return { tone: "ok", text: `Last ${label} delivered ${when}` };
  }

  const reason = delivery.error || (delivery.statusCode ? `HTTP ${delivery.statusCode}` : "no answer");

  return { tone: "fail", text: `Last ${label} failed ${when}: ${reason}` };
};
