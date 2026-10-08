import "./helpers/env.js";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import User from "../models/user.model.js";
import { loginUser, logoutUser, registerUser } from "../controllers/auth.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";
import { cookieFor, createStubs, mockRes, oid, quiet } from "./helpers/stubs.js";

const stubs = createStubs();

beforeEach(() => stubs.restore());
afterEach(() => stubs.restore());

const created = [];

const stubRegisterModels = ({ existing = null, createError = null } = {}) => {
  created.length = 0;
  const lookups = [];

  stubs.stub(User, "findOne", async (query) => {
    lookups.push(query);
    return existing;
  });

  stubs.stub(User, "create", async (data) => {
    if (createError) throw createError;
    created.push(data);
    const user = { _id: oid(), createdAt: new Date(), ...data };
    return { ...user, toObject: () => ({ ...user }) };
  });

  return lookups;
};

const register = async (body) => {
  const res = mockRes();
  await registerUser({ body }, res);
  return res;
};

const valid = { name: "Priyansh", email: "priyansh@example.com", password: "correct horse" };

describe("register", () => {
  for (const field of ["name", "email", "password"]) {
    it(`requires ${field}`, async () => {
      stubRegisterModels();
      const res = await register({ ...valid, [field]: undefined });

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, "All fields are required");
      assert.equal(created.length, 0);
    });
  }

  it("rejects a missing body", async () => {
    stubRegisterModels();
    const res = mockRes();
    await registerUser({}, res);

    assert.equal(res.statusCode, 400);
  });

  const notStrings = [
    ["an object for the email (NoSQL injection)", { email: { $gt: "" } }],
    ["an object for the password", { password: { $ne: null } }],
    ["a number for the password", { password: 12345678 }],
    ["an array for the name", { name: ["a"] }],
    ["a boolean for the email", { email: true }],
  ];

  for (const [label, patch] of notStrings) {
    it(`rejects ${label}`, async () => {
      const lookups = stubRegisterModels();
      const res = await register({ ...valid, ...patch });

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, "Invalid input");
      assert.equal(lookups.length, 0);
    });
  }

  for (const email of ["plainaddress", "a@b", "a b@c.com", "@x.com", "x@.com", "x@y."]) {
    it(`rejects the email ${JSON.stringify(email)}`, async () => {
      stubRegisterModels();
      const res = await register({ ...valid, email });

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, "Invalid email");
    });
  }

  for (const length of [7, 73, 200]) {
    it(`rejects a ${length} character password`, async () => {
      stubRegisterModels();
      const res = await register({ ...valid, password: "x".repeat(length) });

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.message, "Password must be between 8 and 72 characters");
    });
  }

  for (const length of [8, 72]) {
    it(`accepts a ${length} character password`, async () => {
      stubRegisterModels();
      const res = await register({ ...valid, password: "x".repeat(length) });

      assert.equal(res.statusCode, 201);
    });
  }

  it("looks the email up trimmed and lowercased, and stores a trimmed name", async () => {
    const lookups = stubRegisterModels();
    await register({ name: "  Priyansh  ", email: "  Priyansh@Example.COM ", password: "correct horse" });

    assert.deepEqual(lookups, [{ email: "priyansh@example.com" }]);
    assert.equal(created[0].email, "priyansh@example.com");
    assert.equal(created[0].name, "Priyansh");
  });

  it("refuses an email that already exists", async () => {
    stubRegisterModels({ existing: { _id: oid() } });
    const res = await register(valid);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.message, "Email already exists");
    assert.equal(created.length, 0);
  });

  it("refuses an email that was taken between the check and the save", async () => {
    stubRegisterModels({ createError: Object.assign(new Error("dup"), { code: 11000 }) });
    const res = await register(valid);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.message, "Email already exists");
  });

  it("hides the details of an unexpected error", async () => {
    stubRegisterModels({ createError: new Error("secret connection string") });
    const res = await quiet(() => register(valid));

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "Internal Server Error");
    assert.ok(!JSON.stringify(res.body).includes("secret"));
  });

  it("stores only a bcrypt hash, never the password", async () => {
    stubRegisterModels();
    await register(valid);

    assert.notEqual(created[0].password, valid.password);
    assert.match(created[0].password, /^\$2[aby]\$/);
    assert.equal(await bcrypt.compare(valid.password, created[0].password), true);
  });

  it("logs the user in with an httpOnly cookie holding a signed token", async () => {
    stubRegisterModels();
    const res = await register(valid);
    const cookie = res.cookies.token;
    const payload = jwt.verify(cookie.value, process.env.JWT_SECRET);

    assert.equal(res.statusCode, 201);
    assert.equal(cookie.options.httpOnly, true);
    assert.equal(cookie.options.sameSite, "lax");
    assert.equal(cookie.options.secure, false);
    assert.equal(cookie.options.maxAge, 7 * 24 * 60 * 60 * 1000);
    assert.equal(payload.userId, String(res.body.user._id));
  });

  it("never returns the password hash", async () => {
    stubRegisterModels();
    const res = await register(valid);

    assert.equal(res.body.user.password, undefined);
    assert.ok(!JSON.stringify(res.body).includes("$2"));
    assert.equal(res.body.user.email, "priyansh@example.com");
  });

  it("makes the cookie secure and cross-site in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      const production = await import("../controllers/auth.controller.js?production");
      stubRegisterModels();
      const res = mockRes();
      await production.registerUser({ body: valid }, res);

      assert.equal(res.cookies.token.options.secure, true);
      assert.equal(res.cookies.token.options.sameSite, "none");
      assert.equal(res.cookies.token.options.httpOnly, true);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});

describe("cookie SameSite setting", () => {
  const optionsFor = async (env, tag) => {
    const saved = { NODE_ENV: process.env.NODE_ENV, COOKIE_SAMESITE: process.env.COOKIE_SAMESITE };

    process.env.NODE_ENV = env.NODE_ENV;

    if (env.COOKIE_SAMESITE === undefined) delete process.env.COOKIE_SAMESITE;
    else process.env.COOKIE_SAMESITE = env.COOKIE_SAMESITE;

    try {
      const controller = await import(`../controllers/auth.controller.js?${tag}`);
      stubRegisterModels();

      const registered = mockRes();
      await controller.registerUser({ body: valid }, registered);

      const loggedOut = mockRes();
      await controller.logoutUser({}, loggedOut);

      return { set: registered.cookies.token.options, cleared: loggedOut.cleared.token };
    } finally {
      process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.COOKIE_SAMESITE === undefined) delete process.env.COOKIE_SAMESITE;
      else process.env.COOKIE_SAMESITE = saved.COOKIE_SAMESITE;
    }
  };

  const cases = [
    ["production with no setting keeps cross-site cookies working", { NODE_ENV: "production" }, "none", true],
    ["production with lax, for the Vercel proxy", { NODE_ENV: "production", COOKIE_SAMESITE: "lax" }, "lax", true],
    ["production with strict", { NODE_ENV: "production", COOKIE_SAMESITE: "strict" }, "strict", true],
    ["a setting in capitals", { NODE_ENV: "production", COOKIE_SAMESITE: "LAX" }, "lax", true],
    ["production with an unknown value falls back to none", { NODE_ENV: "production", COOKIE_SAMESITE: "banana" }, "none", true],
    ["production with an empty value falls back to none", { NODE_ENV: "production", COOKIE_SAMESITE: "" }, "none", true],
    ["development with no setting is lax and not secure", { NODE_ENV: "development" }, "lax", false],
    ["none is always secure, because browsers refuse it otherwise", { NODE_ENV: "development", COOKIE_SAMESITE: "none" }, "none", true],
  ];

  cases.forEach(([label, env, sameSite, secure], index) => {
    it(`${label}`, async () => {
      const { set, cleared } = await optionsFor(env, `samesite${index}`);

      assert.equal(set.sameSite, sameSite);
      assert.equal(set.secure, secure);
      assert.equal(set.httpOnly, true);
      assert.equal(cleared.sameSite, sameSite);
      assert.equal(cleared.secure, secure);
    });
  });
});

describe("login", () => {
  const stored = async () => {
    const password = await bcrypt.hash("correct horse", 4);
    const user = { _id: oid(), name: "Priyansh", email: "priyansh@example.com", password };
    return { ...user, toObject: () => ({ ...user }) };
  };

  const login = async (body) => {
    const res = mockRes();
    await loginUser({ body }, res);
    return res;
  };

  it("requires both fields", async () => {
    assert.equal((await login({ email: "a@b.co" })).statusCode, 400);
    assert.equal((await login({ password: "x" })).statusCode, 400);
    assert.equal((await login(undefined)).statusCode, 400);
  });

  it("rejects non-string values before touching the database", async () => {
    const lookups = [];
    stubs.stub(User, "findOne", async (query) => {
      lookups.push(query);
      return null;
    });

    const res = await login({ email: { $gt: "" }, password: { $gt: "" } });

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "Invalid input");
    assert.equal(lookups.length, 0);
  });

  it("gives the same answer for an unknown email and a wrong password", async () => {
    const user = await stored();

    stubs.stub(User, "findOne", async (query) => (query.email === user.email ? user : null));

    const unknown = await login({ email: "nobody@example.com", password: "correct horse" });
    const wrong = await login({ email: user.email, password: "wrong password" });

    assert.equal(unknown.statusCode, 401);
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(unknown.body, wrong.body);
    assert.equal(unknown.body.message, "Invalid email or password");
    assert.equal(wrong.cookies.token, undefined);
  });

  it("logs in with the right password, trimming and lowercasing the email", async () => {
    const user = await stored();
    const lookups = [];

    stubs.stub(User, "findOne", async (query) => {
      lookups.push(query);
      return user;
    });

    const res = await login({ email: "  PRIYANSH@example.com ", password: "correct horse" });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(lookups, [{ email: "priyansh@example.com" }]);
    assert.equal(res.cookies.token.options.httpOnly, true);
    assert.equal(jwt.verify(res.cookies.token.value, process.env.JWT_SECRET).userId, String(user._id));
    assert.equal(res.body.user.password, undefined);
  });

  it("hides the details of an unexpected error", async () => {
    stubs.stub(User, "findOne", async () => {
      throw new Error("mongodb://user:pass@host");
    });

    const res = await quiet(() => login({ email: "a@b.co", password: "x" }));

    assert.equal(res.statusCode, 500);
    assert.ok(!JSON.stringify(res.body).includes("mongodb"));
  });
});

describe("logout", () => {
  it("clears the cookie with the same options it was set with", async () => {
    const res = mockRes();
    await logoutUser({}, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.cleared.token.httpOnly, true);
    assert.equal(res.cleared.token.sameSite, "lax");
  });
});

describe("isAuthenticated", () => {
  const app = express();

  app.use(cookieParser());
  app.get("/protected", isAuthenticated, (req, res) => res.json({ id: String(req.user._id) }));

  const userId = oid();
  let selected;

  const withUser = (user) => {
    selected = [];
    stubs.stub(User, "findById", () => ({
      select: async (fields) => {
        selected.push(fields);
        return user;
      },
    }));
  };

  it("rejects a request with no cookie", async () => {
    const res = await request(app).get("/protected");

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Not authenticated");
  });

  it("rejects a token that is not a token", async () => {
    withUser({ _id: userId });
    const res = await request(app).get("/protected").set("Cookie", "token=garbage");

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Unauthorized");
  });

  it("rejects an expired token", async () => {
    withUser({ _id: userId });
    const res = await request(app).get("/protected").set("Cookie", cookieFor(userId, { expiresIn: -10 }));

    assert.equal(res.status, 401);
  });

  it("rejects a token signed with another secret", async () => {
    withUser({ _id: userId });
    const res = await request(app).get("/protected").set("Cookie", cookieFor(userId, { secret: "someone-elses-secret" }));

    assert.equal(res.status, 401);
  });

  it("rejects an unsigned token", async () => {
    withUser({ _id: userId });
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const body = Buffer.from(JSON.stringify({ userId: String(userId) })).toString("base64url");
    const res = await request(app).get("/protected").set("Cookie", `token=${header}.${body}.`);

    assert.equal(res.status, 401);
  });

  it("ignores a token sent in the Authorization header", async () => {
    withUser({ _id: userId });
    const token = cookieFor(userId).replace("token=", "");
    const res = await request(app).get("/protected").set("Authorization", `Bearer ${token}`);

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "Not authenticated");
  });

  it("rejects a valid token whose user was deleted", async () => {
    withUser(null);
    const res = await request(app).get("/protected").set("Cookie", cookieFor(userId));

    assert.equal(res.status, 401);
    assert.equal(res.body.message, "User no longer exists");
  });

  it("rejects the request instead of failing when the database errors", async () => {
    stubs.stub(User, "findById", () => ({
      select: async () => {
        throw new Error("db down");
      },
    }));

    const res = await request(app).get("/protected").set("Cookie", cookieFor(userId));

    assert.equal(res.status, 401);
  });

  it("lets a valid session through and never loads the password hash", async () => {
    withUser({ _id: userId, name: "Priyansh" });
    const res = await request(app).get("/protected").set("Cookie", cookieFor(userId));

    assert.equal(res.status, 200);
    assert.equal(res.body.id, String(userId));
    assert.deepEqual(selected, ["-password"]);
  });
});
