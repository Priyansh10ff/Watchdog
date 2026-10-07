import axios from "axios";
import http from "http";
import https from "https";
import dns from "dns";
import net from "net";
import { performance } from "perf_hooks";
import Monitor from "../models/monitor.model.js";
import CheckResult from "../models/checkResult.model.js";
import isPrivateIp from "../utils/isPrivateIp.js";
import { applyResult, handleIncident } from "./incident.service.js";

const USER_AGENT = "WatchdogBot/1.0 (uptime monitoring)";
const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const LEASE_MS = 2 * 60 * 1000;

const blockPrivate = () => process.env.NODE_ENV === "production";

const privateError = () => {
  const error = new Error("Private addresses are not allowed");
  error.code = "PRIVATE_ADDRESS";
  return error;
};

const cleanHost = (hostname) => hostname.replace(/^\[|\]$/g, "");

const safeLookup = (hostname, options, callback) => {
  dns.lookup(hostname, options, (error, address, family) => {
    if (error) return callback(error);

    if (blockPrivate()) {
      const addresses = Array.isArray(address)
        ? address.map((entry) => entry.address)
        : [address];

      if (addresses.some(isPrivateIp)) return callback(privateError());
    }

    callback(null, address, family);
  });
};

const httpAgent = new http.Agent({ lookup: safeLookup });
const httpsAgent = new https.Agent({ lookup: safeLookup });

const beforeRedirect = (options) => {
  const host = cleanHost(options.hostname || options.host || "");
  if (blockPrivate() && net.isIP(host) && isPrivateIp(host)) {
    throw privateError();
  }
};

const describeError = (error, timeoutMs) => {
  const code = error.code || error.cause?.code || "";

  if (code === "PRIVATE_ADDRESS") return "Private addresses are not allowed";

  if (
    error.name === "CanceledError" ||
    error.name === "TimeoutError" ||
    code === "ERR_CANCELED" ||
    code === "ECONNABORTED"
  ) {
    return `Timed out after ${timeoutMs} ms`;
  }

  const known = {
    ECONNREFUSED: "Connection refused",
    ENOTFOUND: "DNS lookup failed",
    EAI_AGAIN: "DNS lookup failed",
    ECONNRESET: "Connection reset",
    ETIMEDOUT: "Connection timed out",
    EHOSTUNREACH: "Host unreachable",
  };

  if (known[code]) return known[code];
  if (/CERT|SSL|TLS/i.test(code)) return `TLS error: ${code}`;

  return (error.message || "Request failed").slice(0, 200);
};

const requestOnce = async (monitor, maxRedirects) => {
  const started = performance.now();

  const response = await axios.request({
    url: monitor.url,
    method: monitor.method,
    timeout: monitor.timeoutMs,
    signal: AbortSignal.timeout(monitor.timeoutMs),
    maxRedirects,
    beforeRedirect,
    validateStatus: () => true,
    responseType: "text",
    transformResponse: [(data) => data],
    maxContentLength: MAX_BODY_BYTES,
    maxBodyLength: MAX_BODY_BYTES,
    httpAgent,
    httpsAgent,
    headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
  });

  return { response, ms: Math.round(performance.now() - started) };
};

export const runCheck = async (monitor) => {
  const expected = monitor.expectedStatusCodes?.length
    ? monitor.expectedStatusCodes
    : [200];
  const keyword = monitor.keyword || "";

  try {
    const host = cleanHost(new URL(monitor.url).hostname);
    if (blockPrivate() && net.isIP(host) && isPrivateIp(host)) {
      throw privateError();
    }

    let { response, ms } = await requestOnce(monitor, 0);

    const redirected =
      response.status >= 300 &&
      response.status < 400 &&
      response.headers.location &&
      !expected.includes(response.status);

    if (redirected) {
      ({ response, ms } = await requestOnce(monitor, MAX_REDIRECTS));
    }

    const statusCode = response.status;

    if (!expected.includes(statusCode)) {
      return {
        isUp: false,
        statusCode,
        responseTimeMs: ms,
        errorMessage: `Unexpected status ${statusCode}`,
      };
    }

    if (keyword && !String(response.data || "").includes(keyword)) {
      return {
        isUp: false,
        statusCode,
        responseTimeMs: ms,
        errorMessage: "Keyword not found",
      };
    }

    return { isUp: true, statusCode, responseTimeMs: ms, errorMessage: "" };
  } catch (error) {
    return {
      isUp: false,
      statusCode: undefined,
      responseTimeMs: undefined,
      errorMessage: describeError(error, monitor.timeoutMs),
    };
  }
};

export const processMonitor = async (monitor) => {
  const result = await runCheck(monitor);
  const transition = applyResult(monitor, result);

  await CheckResult.create({
    monitor: monitor._id,
    ...result,
    checkedAt: monitor.lastCheckedAt,
  });
  await monitor.save();

  const { event, incident } = await handleIncident(monitor, result, transition);

  return { result, transition, incidentEvent: event, incident };
};

const leaseUntil = () => new Date(Date.now() + LEASE_MS);

export const claimDueMonitors = async (limit = 100) => {
  const claimed = [];

  while (claimed.length < limit) {
    const monitor = await Monitor.findOneAndUpdate(
      { isActive: true, nextCheckAt: { $lte: new Date() } },
      { $set: { nextCheckAt: leaseUntil() } },
      { sort: { nextCheckAt: 1 }, returnDocument: "after" },
    );

    if (!monitor) break;
    claimed.push(monitor);
  }

  return claimed;
};

export const claimMonitor = (id) =>
  Monitor.findOneAndUpdate(
    { _id: id, isActive: true, nextCheckAt: { $lte: new Date() } },
    { $set: { nextCheckAt: leaseUntil() } },
    { returnDocument: "after" },
  );

export const checkSoon = (id) => {
  claimMonitor(id)
    .then((monitor) => (monitor ? processMonitor(monitor) : null))
    .catch((error) => console.log("Immediate check failed:", error.message));
};
