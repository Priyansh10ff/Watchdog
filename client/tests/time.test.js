import { describe, it, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatDuration, timeAgo } from "../src/utils/time.js";

const NOW = new Date("2026-10-08T12:00:00.000Z").getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("timeAgo", () => {
  beforeEach(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
  afterEach(() => mock.timers.reset());

  it("says a monitor has not been checked when there is no date", () => {
    for (const value of [undefined, null, "", 0]) assert.equal(timeAgo(value), "Not checked yet");
  });

  it("says just now for under a minute", () => {
    assert.equal(timeAgo(ago(0)), "Just now");
    assert.equal(timeAgo(ago(59 * SECOND)), "Just now");
  });

  it("counts minutes", () => {
    assert.equal(timeAgo(ago(MINUTE)), "1 min ago");
    assert.equal(timeAgo(ago(59 * MINUTE + 59 * SECOND)), "59 min ago");
  });

  it("counts hours", () => {
    assert.equal(timeAgo(ago(HOUR)), "1 hr ago");
    assert.equal(timeAgo(ago(23 * HOUR + 59 * MINUTE)), "23 hr ago");
  });

  it("counts days, with 1 day in the singular", () => {
    assert.equal(timeAgo(ago(DAY)), "1 day ago");
    assert.equal(timeAgo(ago(2 * DAY)), "2 days ago");
    assert.equal(timeAgo(ago(40 * DAY)), "40 days ago");
  });

  it("treats a time slightly in the future, from clock differences, as just now", () => {
    assert.equal(timeAgo(new Date(NOW + 5 * SECOND).toISOString()), "Just now");
  });

  it("accepts a Date object as well as a string", () => {
    assert.equal(timeAgo(new Date(NOW - 5 * MINUTE)), "5 min ago");
  });
});

describe("formatDuration", () => {
  const cases = [
    [0, "0s"],
    [999, "0s"],
    [1000, "1s"],
    [59999, "59s"],
    [60000, "1m 0s"],
    [125000, "2m 5s"],
    [3599000, "59m 59s"],
    [3600000, "1h 0m"],
    [3 * HOUR + 25 * MINUTE, "3h 25m"],
    [86399000, "23h 59m"],
    [DAY, "1d 0h"],
    [DAY + 5 * HOUR, "1d 5h"],
    [10 * DAY + 23 * HOUR, "10d 23h"],
  ];

  for (const [ms, expected] of cases) {
    it(`shows ${ms} ms as ${expected}`, () => assert.equal(formatDuration(ms), expected));
  }

  it("shows a dash when there is no duration or it is negative", () => {
    for (const value of [undefined, null, -1, -5000]) assert.equal(formatDuration(value), "-");
  });
});

describe("formatDateTime", () => {
  it("shows a dash for a missing date", () => {
    for (const value of [undefined, null, ""]) assert.equal(formatDateTime(value), "-");
  });

  it("formats a real date as text with the day and the time", () => {
    const text = formatDateTime("2026-10-08T12:34:00.000Z");

    assert.equal(typeof text, "string");
    assert.match(text, /\d/);
    assert.notEqual(text, "-");
  });

  it("does not throw on a date that cannot be read", () => {
    assert.doesNotThrow(() => formatDateTime("garbage"));
  });
});
