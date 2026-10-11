import "./helpers/env.js";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/server.js";
import { installMemoryApp } from "./helpers/memoryApp.js";
import { listen, runScript, stopServer } from "./helpers/smoke.js";

const { default: app } = await import("../app.js");

describe("smoke test script against a healthy app", () => {
  let target;
  let server;
  let memory;

  before(async () => {
    target = await startTestServer();
    memory = installMemoryApp();
    server = await listen(app);
  });

  after(async () => {
    await stopServer(server);
    memory.restore();
    await target.close();
  });

  it("passes every check and cleans up after itself", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    const { code, output } = await runScript([base, `--target=${target.base}/ok`], { SMOKE_COOLDOWN_MS: "10500" });

    assert.equal(code, 0, output);
    assert.match(output, /\[ ok \] API answers the health check/);
    assert.match(output, /\[ ok \] Security headers are on/);
    assert.match(output, /\[ ok \] Another website is not allowed by CORS/);
    assert.match(output, /\[ ok \] Registering creates an account and a secure session cookie\s+HttpOnly, SameSite=lax/);
    assert.match(output, /\[ ok \] The server checks it by itself/);
    assert.match(output, /\[ ok \] Results and 24 hour statistics are returned/);
    assert.match(output, /\[ ok \] The list carries recent checks and uptime/);
    assert.match(output, /\[ ok \] Editing changes the name and interval but never the address/);
    assert.match(output, /\[ ok \] Pausing and resuming work/);
    assert.match(output, /\[ ok \] Check now works after the cooldown/);
    assert.match(output, /\[ ok \] A status page can be published and read without logging in\s+shows 127\.0\.0\.1, no full address/);
    assert.match(output, /\[ ok \] Hiding the page makes it answer 404, and deleting removes it/);
    assert.match(output, /\[warn\] Private and local addresses are refused\s+accepted 127\.0\.0\.1/);
    assert.match(output, /Cleaned up: 2 monitor\(s\) deleted, logged out\./);
    assert.match(output, /The test account smoke-[a-z0-9]+@watchdog\.test stays in the database/);
    assert.match(output, /\d+ passed, 1 warning\(s\), 0 failed/);
    assert.equal(memory.db.monitors.length, 0, "the test monitors should be deleted");
    assert.equal(memory.db.pages.length, 0, "the status page should be deleted");
    assert.equal(memory.db.users.length, 1, "one throwaway account is left behind, as announced");
  });
});
