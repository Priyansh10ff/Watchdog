import validateUrl from "./validateUrl.js";

export const WEBHOOK_FORMATS = ["slack", "discord", "generic"];

const SLACK_HOST = "hooks.slack.com";
const SLACK_PATHS = ["/services/", "/triggers/", "/workflows/"];
const DISCORD_HOSTS = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];
const DISCORD_PATH = "/api/webhooks/";

export const validateWebhookUrl = (value, format) => {
  if (typeof value !== "string" || !value.trim()) {
    return { valid: false, message: "Webhook URL is required" };
  }

  const text = value.trim();

  if (text.length > 500) {
    return { valid: false, message: "Webhook URL is too long" };
  }

  const base = validateUrl(text);

  if (!base.valid) return base;

  const parsed = new URL(base.url);

  if (process.env.NODE_ENV === "production") {
    if (parsed.protocol !== "https:") {
      return { valid: false, message: "Webhook URLs must use https" };
    }

    if (format === "slack") {
      const fits =
        parsed.hostname === SLACK_HOST &&
        SLACK_PATHS.some((path) => parsed.pathname.startsWith(path));

      if (!fits) {
        return {
          valid: false,
          message: "Slack webhooks start with https://hooks.slack.com/services/",
        };
      }
    }

    if (format === "discord") {
      const fits =
        DISCORD_HOSTS.includes(parsed.hostname) &&
        parsed.pathname.startsWith(DISCORD_PATH);

      if (!fits) {
        return {
          valid: false,
          message: "Discord webhooks start with https://discord.com/api/webhooks/",
        };
      }
    }
  }

  parsed.hash = "";

  return { valid: true, url: parsed.href };
};

export const maskUrl = (value) => {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}/…${String(value).slice(-4)}`;
  } catch {
    return "";
  }
};
