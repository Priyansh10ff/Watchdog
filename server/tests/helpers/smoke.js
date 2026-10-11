import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "smokeTest.mjs");

export const runScript = (args, env = {}) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("close", (code) => resolve({ code, output }));
  });

export const listen = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });

export const stopServer = (server) =>
  new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
