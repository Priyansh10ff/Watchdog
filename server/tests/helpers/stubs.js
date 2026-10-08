import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import User from "../../models/user.model.js";

export const oid = () => new mongoose.Types.ObjectId();

export const stub = (target, name, fn) => {
  const original = target[name];
  target[name] = fn;

  return () => {
    target[name] = original;
  };
};

export const chain = (rows) => {
  let current = rows;

  const query = {
    sort: () => query,
    limit: (count) => {
      current = current.slice(0, count);
      return query;
    },
    select: () => query,
    lean: async () => current.map((row) => ({ ...row })),
    then: (resolve, reject) => Promise.resolve(current).then(resolve, reject),
  };

  return query;
};

export const cookieFor = (userId, options = {}) =>
  `token=${jwt.sign({ userId }, options.secret || process.env.JWT_SECRET, {
    expiresIn: options.expiresIn || "1h",
  })}`;

export const asUser = (user) =>
  stub(User, "findById", () => ({ select: async () => user }));

export const mockRes = () => ({
  statusCode: 200,
  body: undefined,
  cookies: {},
  cleared: {},
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  cookie(name, value, options) {
    this.cookies[name] = { value, options };
    return this;
  },
  clearCookie(name, options) {
    this.cleared[name] = options;
    return this;
  },
});

export const quiet = async (fn) => {
  const original = console.log;
  console.log = () => {};

  try {
    return await fn();
  } finally {
    console.log = original;
  }
};

export const createStubs = () => {
  const restores = [];

  return {
    stub: (target, name, fn) => {
      restores.push(stub(target, name, fn));
    },
    restore: () => {
      while (restores.length) restores.pop()();
    },
  };
};
