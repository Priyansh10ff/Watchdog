import "./helpers/env.js";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import StatusPage from "../models/statusPage.model.js";
import { createStubs } from "./helpers/stubs.js";

process.env.API_RATE_LIMIT = "1000";

const { default: app } = await import("../app.js");

const stubs = createStubs();

afterEach(() => stubs.restore());

describe("public status page limit", () => {
  it("allows 60 requests a minute from one address, then answers 429", async () => {
    stubs.stub(StatusPage, "findOne", () => {
      const query = { lean: async () => null };
      return query;
    });

    const statuses = [];

    for (let i = 0; i < 63; i += 1) {
      const res = await request(app).get("/api/status/some-page");

      statuses.push(res.status);

      if (res.status === 429) {
        assert.deepEqual(res.body, { success: false, message: "Too many requests, try again in a minute" });
        assert.ok(res.headers["retry-after"]);
      }
    }

    assert.deepEqual(statuses, [...Array(60).fill(404), 429, 429, 429]);
  });

  it("counts malformed and unknown links too, so probing cannot dodge the limit", async () => {
    const res = await request(app).get("/api/status/x");

    assert.equal(res.status, 429);
  });

  it("does not limit the rest of the API", async () => {
    const res = await request(app).get("/api/nothing");

    assert.equal(res.status, 404);
  });
});
