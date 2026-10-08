import "./helpers/env.js";
import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import validateUrl from "../utils/validateUrl.js";

const original = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = original;
});

describe("validateUrl", () => {
  it("accepts http and https addresses and returns the normalised URL", () => {
    assert.deepEqual(validateUrl("https://Example.com"), { valid: true, url: "https://example.com/" });
    assert.deepEqual(validateUrl("http://example.com/path?x=1"), { valid: true, url: "http://example.com/path?x=1" });
    assert.deepEqual(validateUrl("https://example.com:8443/a"), { valid: true, url: "https://example.com:8443/a" });
  });

  for (const value of ["", "   ", "not a url", "example.com", "//example.com", undefined, null, 42, {}, []]) {
    it(`rejects ${JSON.stringify(value)} as invalid`, () => {
      const result = validateUrl(value);
      assert.equal(result.valid, false);
      assert.equal(result.message, "Invalid URL");
    });
  }

  for (const value of ["ftp://example.com", "file:///etc/passwd", "javascript:alert(1)", "data:text/plain,hi", "gopher://example.com", "ws://example.com"]) {
    it(`rejects the ${value.split(":")[0]} scheme`, () => {
      const result = validateUrl(value);
      assert.equal(result.valid, false);
      assert.equal(result.message, "URL must start with http:// or https://");
    });
  }

  for (const value of ["https://user:pass@example.com", "https://user@example.com", "http://:secret@example.com"]) {
    it(`rejects credentials in ${value}`, () => {
      const result = validateUrl(value);
      assert.equal(result.valid, false);
      assert.equal(result.message, "Do not put credentials in the URL");
    });
  }

  describe("outside production", () => {
    for (const value of ["http://localhost:4000/health", "http://127.0.0.1:5000", "http://192.168.1.10/", "http://10.0.0.5/"]) {
      it(`allows ${value} so you can test locally`, () => {
        process.env.NODE_ENV = "development";
        assert.equal(validateUrl(value).valid, true);
      });
    }
  });

  describe("in production", () => {
    const blocked = [
      "http://localhost",
      "http://LOCALHOST:3000/",
      "http://0.0.0.0/",
      "http://127.0.0.1/",
      "http://127.8.9.10:8080/",
      "http://10.1.2.3/",
      "http://192.168.0.1/",
      "http://172.16.0.1/",
      "http://172.20.1.1/",
      "http://172.31.255.255/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://2130706433/",
      "http://0x7f.0.0.1/",
      "http://0177.0.0.1/",
      "http://127.1/",
    ];

    for (const value of blocked) {
      it(`blocks ${value}`, () => {
        process.env.NODE_ENV = "production";
        const result = validateUrl(value);
        assert.equal(result.valid, false);
        assert.equal(result.message, "Private and local addresses are not allowed");
      });
    }

    for (const value of ["https://example.com", "http://8.8.8.8/", "http://172.15.0.1/", "http://172.32.0.1/", "https://localhost.example.com/", "https://my-localhost.dev/"]) {
      it(`allows the public address ${value}`, () => {
        process.env.NODE_ENV = "production";
        assert.equal(validateUrl(value).valid, true);
      });
    }

    it("leaves IPv6 forms of private addresses to the check engine, which refuses them at request time", () => {
      process.env.NODE_ENV = "production";
      assert.equal(validateUrl("http://[::ffff:7f00:1]/").valid, true);
      assert.equal(validateUrl("http://[fd00::1]/").valid, true);
    });
  });
});
