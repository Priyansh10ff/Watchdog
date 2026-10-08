import "./helpers/env.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import isPrivateIp from "../utils/isPrivateIp.js";

const privateV4 = [
  "0.0.0.0",
  "10.0.0.1",
  "10.255.255.255",
  "127.0.0.1",
  "127.1.2.3",
  "100.64.0.1",
  "100.127.255.255",
  "169.254.169.254",
  "172.16.0.1",
  "172.31.255.255",
  "192.168.0.1",
  "192.168.255.255",
  "224.0.0.1",
  "239.255.255.255",
  "255.255.255.255",
];

const publicV4 = [
  "8.8.8.8",
  "1.1.1.1",
  "11.0.0.1",
  "100.63.255.255",
  "100.128.0.1",
  "169.253.255.255",
  "169.255.0.1",
  "172.15.255.255",
  "172.32.0.1",
  "192.167.255.255",
  "192.169.0.1",
  "223.255.255.255",
];

const privateV6 = [
  "::1",
  "::",
  "fc00::1",
  "fd12:3456:789a::1",
  "fe80::1",
  "febf::1",
  "::ffff:127.0.0.1",
  "::ffff:10.0.0.1",
  "::ffff:192.168.1.1",
  "::ffff:169.254.169.254",
  "::ffff:7f00:1",
  "::ffff:a00:1",
  "::ffff:c0a8:101",
  "::FFFF:127.0.0.1",
  "FD00::1",
];

const publicV6 = [
  "2606:4700:4700::1111",
  "2001:4860:4860::8888",
  "::ffff:8.8.8.8",
  "::ffff:808:808",
  "fec0::1",
];

describe("isPrivateIp", () => {
  for (const ip of privateV4) {
    it(`treats ${ip} as private`, () => assert.equal(isPrivateIp(ip), true));
  }

  for (const ip of publicV4) {
    it(`treats ${ip} as public`, () => assert.equal(isPrivateIp(ip), false));
  }

  for (const ip of privateV6) {
    it(`treats ${ip} as private`, () => assert.equal(isPrivateIp(ip), true));
  }

  for (const ip of publicV6) {
    it(`treats ${ip} as public`, () => assert.equal(isPrivateIp(ip), false));
  }

  for (const value of ["", "example.com", "localhost", "999.1.1.1", "1.2.3", "::gggg", "10.0.0.1/8", " 10.0.0.1"]) {
    it(`does not treat the non-address ${JSON.stringify(value)} as private`, () => {
      assert.equal(isPrivateIp(value), false);
    });
  }
});
