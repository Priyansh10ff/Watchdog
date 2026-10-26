import http from "http";
import https from "https";
import dns from "dns";
import net from "net";
import isPrivateIp from "./isPrivateIp.js";

export const blockPrivate = () => process.env.NODE_ENV === "production";

export const privateError = () => {
  const error = new Error("Private addresses are not allowed");
  error.code = "PRIVATE_ADDRESS";
  return error;
};

export const cleanHost = (hostname) => hostname.replace(/^\[|\]$/g, "");

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

export const httpAgent = new http.Agent({ lookup: safeLookup });
export const httpsAgent = new https.Agent({ lookup: safeLookup });

export const beforeRedirect = (options) => {
  const host = cleanHost(options.hostname || options.host || "");
  if (blockPrivate() && net.isIP(host) && isPrivateIp(host)) {
    throw privateError();
  }
};

export const describeError = (error, timeoutMs) => {
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
