import "./helpers/env.js";
import { describe, it, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import StatusPage from "../models/statusPage.model.js";
import { createStubs, quiet } from "./helpers/stubs.js";

process.env.API_RATE_LIMIT = "50";

const { default: app } = await import("../app.js");

const stubs = createStubs();
const ORIGIN = "http://localhost:5173";

let counted = 0;

const hit = async () => {
  counted += 1;
  return request(app).get("/api/nothing");
};

afterEach(() => stubs.restore());

describe("health check", () => {
  it("answers with JSON", async () => {
    const res = await request(app).get("/api/health");

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { success: true, message: "Server is running" });
  });

  it("is never rate limited, so uptime pings keep working", async () => {
    for (let i = 0; i < 80; i += 1) {
      const res = await request(app).get("/api/health");

      assert.equal(res.status, 200);
    }
  });
});

describe("error handling", () => {
  it("answers invalid JSON with a 400 JSON message instead of an HTML error page", async () => {
    counted += 1;
    const res = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{bad json");

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: "Invalid JSON" });
    assert.match(res.headers["content-type"], /json/);
  });

  it("answers a body over 10 kB with 413", async () => {
    counted += 1;
    const res = await request(app).post("/api/auth/login").send({ email: "a@b.co", password: "x".repeat(11000) });

    assert.equal(res.status, 413);
    assert.deepEqual(res.body, { success: false, message: "Request body is too large" });
  });

  it("accepts a body just under the limit", async () => {
    counted += 1;
    const res = await request(app).post("/api/monitors").send({ name: "x".repeat(9000) });

    assert.equal(res.status, 401);
  });

  it("counts requests with invalid or oversized bodies against the rate limit", async () => {
    const before = counted;

    counted += 2;
    const first = await request(app).post("/api/monitors").set("Content-Type", "application/json").send("{bad");
    const second = await request(app).post("/api/monitors").send({ name: "x".repeat(11000) });

    assert.equal(first.status, 400);
    assert.equal(second.status, 413);
    assert.equal(Number(second.headers["x-ratelimit-limit"]) - Number(second.headers["x-ratelimit-remaining"]), counted, `counted ${counted - before} new requests`);
  });

  it("answers an unknown route and a wrong method with a JSON 404", async () => {
    counted += 2;
    const unknown = await request(app).get("/api/nothing-here");
    const wrongMethod = await request(app).put("/api/health");

    assert.equal(unknown.status, 404);
    assert.deepEqual(unknown.body, { success: false, message: "Route not found" });
    assert.equal(wrongMethod.status, 404);
  });

  it("answers a malformed path with a 400, not a 500", async () => {
    counted += 1;
    const res = await request(app).get("/api/status/%E0%A4%A");

    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, message: "Bad request" });
  });

  it("never shows a stack trace or internals in an error", async () => {
    stubs.stub(StatusPage, "findOne", () => {
      throw new Error("mongodb://admin:secret@cluster/db at /srv/app/index.js:42");
    });

    counted += 1;
    const res = await quiet(() => request(app).get("/api/status/some-page"));
    const text = JSON.stringify(res.body);

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { success: false, message: "Internal Server Error" });
    assert.ok(!text.includes("mongodb") && !text.includes("/srv/app") && !text.includes("at "));
  });
});

describe("security headers", () => {
  it("sets the helmet headers and hides the framework", async () => {
    const { headers } = await request(app).get("/api/health");

    assert.equal(headers["x-powered-by"], undefined);
    assert.equal(headers["x-content-type-options"], "nosniff");
    assert.equal(headers["x-frame-options"], "SAMEORIGIN");
    assert.ok(headers["strict-transport-security"]);
    assert.ok(headers["content-security-policy"]);
    assert.equal(headers["referrer-policy"], "no-referrer");
  });
});

describe("CORS", () => {
  it("allows the client's origin with credentials", async () => {
    counted += 1;
    const res = await request(app).get("/api/nothing").set("Origin", ORIGIN);

    assert.equal(res.headers["access-control-allow-origin"], ORIGIN);
    assert.equal(res.headers["access-control-allow-credentials"], "true");
  });

  for (const origin of ["https://evil.example.com", "http://localhost:5174", "http://localhost", "null"]) {
    it(`never allows ${origin}: the answer names only the real client, so browsers refuse it`, async () => {
      counted += 1;
      const res = await request(app).get("/api/nothing").set("Origin", origin);

      assert.equal(res.headers["access-control-allow-origin"], ORIGIN);
      assert.notEqual(res.headers["access-control-allow-origin"], origin);
      assert.notEqual(res.headers["access-control-allow-origin"], "*");
    });
  }

  it("answers a preflight from the client with the allowed methods and headers", async () => {
    const res = await request(app)
      .options("/api/monitors")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "PATCH")
      .set("Access-Control-Request-Headers", "Content-Type");

    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-origin"], ORIGIN);

    const methods = res.headers["access-control-allow-methods"];

    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) assert.ok(methods.includes(method), method);
    assert.match(res.headers["access-control-allow-headers"], /Content-Type/i);
  });

  it("gives no permission to a preflight from another origin", async () => {
    const res = await request(app)
      .options("/api/monitors")
      .set("Origin", "https://evil.example.com")
      .set("Access-Control-Request-Method", "DELETE");

    assert.notEqual(res.headers["access-control-allow-origin"], "https://evil.example.com");
    assert.notEqual(res.headers["access-control-allow-origin"], "*");
  });

  it("does not count preflight requests against the rate limit", async () => {
    for (let i = 0; i < 60; i += 1) {
      const res = await request(app).options("/api/monitors").set("Origin", ORIGIN).set("Access-Control-Request-Method", "GET");

      assert.equal(res.status, 204);
    }
  });
});

describe("production settings", () => {
  const load = async (tag, env) => {
    const saved = { NODE_ENV: process.env.NODE_ENV, TRUST_PROXY: process.env.TRUST_PROXY };

    process.env.NODE_ENV = env.NODE_ENV;

    if (env.TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = env.TRUST_PROXY;

    try {
      const module = await import(`../app.js?${tag}`);
      return module.default.get("trust proxy");
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.TRUST_PROXY === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = saved.TRUST_PROXY;
    }
  };

  it("trusts one proxy hop by default", async () => {
    assert.equal(await load("one", { NODE_ENV: "production" }), 1);
  });

  it("trusts the number of hops in TRUST_PROXY, for example 2 behind the Vercel proxy", async () => {
    assert.equal(await load("two", { NODE_ENV: "production", TRUST_PROXY: "2" }), 2);
  });

  it("falls back to one hop when TRUST_PROXY is not a number", async () => {
    assert.equal(await load("junk", { NODE_ENV: "production", TRUST_PROXY: "abc" }), 1);
  });

  it("does not trust proxy headers outside production", async () => {
    assert.equal(await load("dev", { NODE_ENV: "development", TRUST_PROXY: "2" }), false);
  });
});

describe("rate limiting", () => {
  it("limits login and register together to 10 attempts per 15 minutes", async () => {
    const statuses = [];

    for (let i = 0; i < 12; i += 1) {
      counted += 1;
      const path = i % 2 === 0 ? "/api/auth/login" : "/api/auth/register";
      const res = await request(app).post(path).send({});

      statuses.push(res.status);

      if (res.status === 429) {
        assert.deepEqual(res.body, { success: false, message: "Too many attempts, try again in 15 minutes" });
      }
    }

    assert.deepEqual(statuses, [...Array(10).fill(400), 429, 429]);
  });

  it("does not let the login limit block other routes", async () => {
    const res = await hit();

    assert.equal(res.status, 404);
  });

  it("stops one address after the API-wide limit and keeps the health check open", async () => {
    let firstBlocked = null;
    let blocked;

    while (counted < 70) {
      const res = await hit();

      if (res.status === 429 && firstBlocked === null) {
        firstBlocked = counted;
        blocked = res;
      }
    }

    assert.equal(firstBlocked, 51);
    assert.deepEqual(blocked.body, { success: false, message: "Too many requests, slow down and try again later" });
    assert.ok(blocked.headers["retry-after"]);
    assert.equal(blocked.headers["x-ratelimit-remaining"], "0");
    assert.equal((await request(app).get("/api/health")).status, 200);
  });

  it("blocks every API route once the limit is reached, including the public ones", async () => {
    for (const path of ["/api/monitors", "/api/status/some-page", "/api/auth/me", "/api/incidents"]) {
      const res = await request(app).get(path);

      assert.equal(res.status, 429, path);
    }
  });
});
