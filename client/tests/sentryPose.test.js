import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { POSES, applyPose, poseTargets, posePair, prefersReducedMotion, setPose } from "../src/utils/sentryPose.js";

const fakeRoot = () => ({
  queried: [],
  querySelector(selector) {
    this.queried.push(selector);
    return { selector };
  },
});

const fakeGsap = () => {
  const calls = { set: [], to: [] };

  return {
    calls,
    set: (target, vars) => calls.set.push([target, vars]),
    to: (target, vars) => calls.to.push([target, vars]),
  };
};

describe("poses", () => {
  it("has three moods with every part defined", () => {
    assert.deepEqual(Object.keys(POSES).sort(), ["down", "slow", "up"]);

    for (const pose of Object.values(POSES)) {
      assert.deepEqual(Object.keys(pose).sort(), ["browL", "browR", "closed", "earL", "earR", "mouthC", "mouthO", "open", "waves", "zs"]);
    }
  });

  it("asleep means closed eyes, drooping ears and floating z's", () => {
    assert.equal(POSES.up.closed, 1);
    assert.equal(POSES.up.open, 0);
    assert.equal(POSES.up.zs, 1);
    assert.ok(POSES.up.earL > 0);
  });

  it("barking means open eyes and mouth, sound waves and no z's", () => {
    assert.equal(POSES.down.open, 1);
    assert.equal(POSES.down.mouthO, 1);
    assert.equal(POSES.down.mouthC, 0);
    assert.equal(POSES.down.waves, 1);
    assert.equal(POSES.down.zs, 0);
  });

  it("listening means open eyes with a closed mouth and no waves", () => {
    assert.equal(POSES.slow.open, 1);
    assert.equal(POSES.slow.mouthC, 1);
    assert.equal(POSES.slow.waves, 0);
  });

  it("never shows open and closed eyes together, or an open and closed mouth together", () => {
    for (const pose of Object.values(POSES)) {
      assert.equal(pose.closed + pose.open, 1);
      assert.equal(pose.mouthC + pose.mouthO, 1);
    }
  });

  it("looks every part up by name inside the dog", () => {
    const root = fakeRoot();
    const targets = poseTargets(root, "down");

    assert.equal(targets.length, 10);
    assert.deepEqual(root.queried, ["earL", "earR", "eyesClosed", "eyesOpen", "browL", "browR", "mouthClosed", "mouthOpen", "waves", "zs"].map((name) => `[data-part="${name}"]`));
    assert.deepEqual(targets[0][1], { rotation: POSES.down.earL });
    assert.deepEqual(targets[2][1], { opacity: POSES.down.closed });
  });
});

describe("applying a pose", () => {
  it("sets every part at once", () => {
    const gsap = fakeGsap();
    setPose(gsap, fakeRoot(), "up");

    assert.equal(gsap.calls.set.length, 10);
    assert.equal(gsap.calls.to.length, 0);
  });

  it("moves every part over the given time, with a springy ease for rotations only", () => {
    const gsap = fakeGsap();
    applyPose(gsap, fakeRoot(), "slow", 0.6);

    assert.equal(gsap.calls.to.length, 10);

    for (const [, vars] of gsap.calls.to) {
      assert.equal(vars.duration, 0.6);
      assert.equal(vars.overwrite, "auto");
      assert.equal(vars.ease, "rotation" in vars ? "back.out(2)" : "power2.out");
    }
  });

  it("adds a transition between two moods to a timeline without painting it early", () => {
    const added = [];
    const timeline = { fromTo: (...args) => added.push(args) };

    posePair(timeline, fakeRoot(), "up", "down", 3.5, 0.4);

    assert.equal(added.length, 10);

    const [, from, to, at] = added[0];

    assert.deepEqual(from, { rotation: POSES.up.earL });
    assert.equal(to.rotation, POSES.down.earL);
    assert.equal(to.duration, 0.4);
    assert.equal(to.immediateRender, false);
    assert.equal(at, 3.5);
  });
});

describe("prefersReducedMotion", () => {
  const original = globalThis.window;

  afterEach(() => {
    if (original === undefined) delete globalThis.window;
    else globalThis.window = original;
  });

  it("is false when there is no browser", () => {
    delete globalThis.window;

    assert.equal(prefersReducedMotion(), false);
  });

  it("is false when the browser cannot answer", () => {
    globalThis.window = {};

    assert.equal(prefersReducedMotion(), false);
  });

  it("follows the reduced motion setting", () => {
    globalThis.window = { matchMedia: (query) => ({ matches: query.includes("reduce") }) };
    assert.equal(prefersReducedMotion(), true);

    globalThis.window = { matchMedia: () => ({ matches: false }) };
    assert.equal(prefersReducedMotion(), false);
  });
});
