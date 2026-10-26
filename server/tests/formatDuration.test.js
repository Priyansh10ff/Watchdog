import "./helpers/env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatDuration } from "../utils/formatDuration.js";

describe("formatDuration", () => {
  const cases = [
    [0, "0s"],
    [400, "0s"],
    [500, "1s"],
    [45 * 1000, "45s"],
    [59 * 1000, "59s"],
    [60 * 1000, "1m 0s"],
    [125 * 1000, "2m 5s"],
    [14 * 60 * 1000, "14m 0s"],
    [59 * 60 * 1000 + 59 * 1000, "59m 59s"],
    [60 * 60 * 1000, "1h 0m"],
    [(2 * 3600 + 5 * 60) * 1000, "2h 5m"],
    [(26 * 3600 + 30 * 60) * 1000, "26h 30m"],
  ];

  cases.forEach(([ms, expected]) => {
    it(`${ms} ms is ${expected}`, () => {
      assert.equal(formatDuration(ms), expected);
    });
  });

  it("says unknown for anything that is not a number", () => {
    for (const value of [undefined, null, "abc", Number.NaN, Infinity, {}]) {
      assert.equal(formatDuration(value), "unknown");
    }
  });

  it("never goes below zero", () => {
    assert.equal(formatDuration(-5000), "0s");
  });

  it("accepts a number as text", () => {
    assert.equal(formatDuration("60000"), "1m 0s");
  });
});
