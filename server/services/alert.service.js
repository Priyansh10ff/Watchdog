import axios from "axios";
import crypto from "crypto";
import net from "net";
import WebhookChannel from "../models/webhookChannel.model.js";
import isPrivateIp from "../utils/isPrivateIp.js";
import { formatDuration } from "../utils/formatDuration.js";
import {
  blockPrivate,
  cleanHost,
  describeError,
  httpAgent,
  httpsAgent,
  privateError,
} from "../utils/safeHttp.js";

const USER_AGENT = "WatchdogBot/1.0 (alerts)";
const DISCORD_USER_AGENT = "DiscordBot (https://github.com/Priyansh10ff/Watchdog, 1.0)";
const TIMEOUT_MS = 5000;
const RETRY_MS = 1500;
const MAX_RESPONSE_BYTES = 64 * 1024;
const COLORS = { opened: 0xd4351c, resolved: 0x2ea44f, test: 0x2b46ff };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const clip = (value, max) => {
  const text = String(value ?? "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const formatTime = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "unknown";

  const text = date.toLocaleString("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${text} UTC`;
};

const linkOf = () => {
  const base = process.env.CLIENT_URL;

  if (!base) return "";

  try {
    const url = new URL("/incidents", base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const causeOf = (incident) => {
  const cause = incident?.cause;

  if (cause?.errorMessage) return clip(cause.errorMessage, 200);
  if (cause?.statusCode) return `Status ${cause.statusCode}`;
  return "No reply";
};

export const describeEvent = (kind, monitor, incident) => {
  const link = linkOf();
  const at = new Date();

  if (kind === "test") {
    return {
      kind,
      type: "test",
      title: "Watchdog test message",
      summary: "This channel is connected. You will get a message here when a monitor goes down and when it recovers.",
      fields: [],
      link,
      at,
      monitor: null,
      incident: null,
    };
  }

  const name = clip(monitor.name, 60);
  const host = hostOf(monitor.url);

  if (kind === "opened") {
    return {
      kind,
      type: "incident.opened",
      title: `${name} is down`,
      summary: "",
      fields: [
        ["Site", host],
        ["Cause", causeOf(incident)],
        ["Started", formatTime(incident.startedAt)],
      ],
      link,
      at,
      monitor: { id: String(monitor._id), name, host },
      incident,
    };
  }

  return {
    kind,
    type: "incident.resolved",
    title: `${name} is back up`,
    summary: "",
    fields: [
      ["Site", host],
      ["Down for", formatDuration(incident.durationMs)],
      ["Cause", causeOf(incident)],
      ["Resolved", formatTime(incident.resolvedAt)],
    ],
    link,
    at,
    monitor: { id: String(monitor._id), name, host },
    incident,
  };
};

const escapeSlack = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const escapeDiscord = (value) => String(value).replace(/([\\*_~`|>])/g, "\\$1");

export const slackPayload = (info) => {
  const icon =
    info.kind === "opened" ? ":red_circle:" : info.kind === "resolved" ? ":large_green_circle:" : ":bell:";
  const lines = [`${icon} *${escapeSlack(info.title)}*`];

  if (info.summary) lines.push(escapeSlack(info.summary));
  for (const [label, value] of info.fields) lines.push(`${label}: ${escapeSlack(value)}`);
  if (info.link) lines.push(`<${info.link}|Open Watchdog>`);

  return { text: lines.join("\n") };
};

export const discordPayload = (info) => ({
  username: "Watchdog",
  allowed_mentions: { parse: [] },
  embeds: [
    {
      title: escapeDiscord(clip(info.title, 250)),
      description: info.summary ? escapeDiscord(info.summary) : undefined,
      url: info.link || undefined,
      color: COLORS[info.kind],
      timestamp: info.at.toISOString(),
      fields: info.fields.map(([name, value]) => ({
        name,
        value: escapeDiscord(clip(value, 1000)) || "-",
        inline: true,
      })),
      footer: { text: "Watchdog" },
    },
  ],
});

export const genericPayload = (info) => ({
  event: info.type,
  sentAt: info.at.toISOString(),
  message: info.title,
  ...(info.monitor ? { monitor: info.monitor } : {}),
  ...(info.incident
    ? {
        incident: {
          id: String(info.incident._id),
          status: info.incident.status,
          startedAt: info.incident.startedAt,
          resolvedAt: info.incident.resolvedAt ?? null,
          durationMs: info.incident.durationMs ?? null,
          cause: {
            statusCode: info.incident.cause?.statusCode ?? null,
            errorMessage: info.incident.cause?.errorMessage || "",
          },
        },
      }
    : {}),
});

export const sign = (secret, timestamp, body) =>
  crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");

const build = (channel, info) => {
  const payload =
    channel.format === "slack"
      ? slackPayload(info)
      : channel.format === "discord"
        ? discordPayload(info)
        : genericPayload(info);

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": channel.format === "discord" ? DISCORD_USER_AGENT : USER_AGENT,
    "X-Watchdog-Event": info.type,
  };

  if (channel.format === "generic") {
    headers["X-Watchdog-Timestamp"] = timestamp;

    if (channel.signingSecret) {
      headers["X-Watchdog-Signature"] = `sha256=${sign(channel.signingSecret, timestamp, body)}`;
    }
  }

  return { body, headers };
};

const redact = (message, url) => {
  let text = String(message);
  const parts = [url];

  try {
    const parsed = new URL(url);
    parts.push(parsed.pathname, parsed.search);
  } catch {
    return text;
  }

  for (const part of parts) {
    if (part && part !== "/" && text.includes(part)) text = text.split(part).join("[webhook]");
  }

  return text;
};

const explain = (status, data) => {
  const text = typeof data === "string" ? data.trim() : "";

  if (!text) return `HTTP ${status}`;

  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      const reason = clip(parsed.message || parsed.error || "", 120);
      const wait = parsed.retry_after;

      if (reason && wait) return `HTTP ${status}: ${reason} (retry in ${Math.ceil(Number(wait))}s)`;
      if (reason) return `HTTP ${status}: ${reason}`;
    } catch (error) {
      return `HTTP ${status}`;
    }
  }

  if (status === 429 && /cloudflare|blocked|banned/i.test(text)) {
    return `HTTP ${status}: blocked before reaching the service, not a message limit`;
  }

  return `HTTP ${status}`;
};

const attempt = async (channel, info, timeoutMs) => {
  try {
    const host = cleanHost(new URL(channel.url).hostname);

    if (blockPrivate() && net.isIP(host) && isPrivateIp(host)) throw privateError();

    const { body, headers } = build(channel, info);

    const response = await axios.post(channel.url, body, {
      headers,
      timeout: timeoutMs,
      signal: AbortSignal.timeout(timeoutMs),
      maxRedirects: 0,
      validateStatus: () => true,
      responseType: "text",
      transformResponse: [(data) => data],
      maxContentLength: MAX_RESPONSE_BYTES,
      maxBodyLength: MAX_RESPONSE_BYTES,
      httpAgent,
      httpsAgent,
    });

    const status = response.status;

    if (status >= 200 && status < 300) {
      return { ok: true, statusCode: status, error: "", retryable: false };
    }

    if (status >= 300 && status < 400) {
      return { ok: false, statusCode: status, error: `Redirects are not followed (HTTP ${status})`, retryable: false };
    }

    return {
      ok: false,
      statusCode: status,
      error: explain(status, response.data),
      retryable: status >= 500 || status === 429,
    };
  } catch (error) {
    const blocked = error.code === "PRIVATE_ADDRESS";

    return {
      ok: false,
      statusCode: null,
      error: redact(describeError(error, timeoutMs), channel.url),
      retryable: !blocked,
    };
  }
};

export const deliver = async (channel, info, options = {}) => {
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_MS;
  const mayRetry = options.retry !== false;

  let outcome = await attempt(channel, info, timeoutMs);
  let attempts = 1;

  if (!outcome.ok && outcome.retryable && mayRetry) {
    await sleep(retryDelayMs);
    outcome = await attempt(channel, info, timeoutMs);
    attempts = 2;
  }

  return { ok: outcome.ok, statusCode: outcome.statusCode, error: outcome.error, attempts };
};

const record = (channel, outcome, event) =>
  WebhookChannel.updateOne(
    { _id: channel._id },
    {
      $set: {
        lastDelivery: {
          at: new Date(),
          event,
          ok: outcome.ok,
          statusCode: outcome.statusCode,
          error: outcome.error,
        },
      },
    },
  );

export const sendTest = async (channel, options = {}) => {
  const outcome = await deliver(channel, describeEvent("test"), { retry: false, ...options });
  await record(channel, outcome, "test");
  return outcome;
};

export const notifyIncident = async (kind, incident, monitor, options = {}) => {
  try {
    if (kind !== "opened" && kind !== "resolved") return;

    const channels = await WebhookChannel.find({ user: monitor.user, isActive: true }).select(
      "+url +signingSecret",
    );

    if (!channels.length) return;

    const info = describeEvent(kind, monitor, incident);

    await Promise.allSettled(
      channels.map(async (channel) => {
        const outcome = await deliver(channel, info, options);

        if (!outcome.ok) {
          console.log(`Alert ${info.type} to channel ${channel._id} failed: ${outcome.error}`);
        }

        await record(channel, outcome, info.type);
      }),
    );
  } catch (error) {
    console.log(`Alert delivery failed: ${error.message}`);
  }
};
