export const POSES = {
  up: { earL: 20, earR: -20, closed: 1, open: 0, browL: 0, browR: 0, mouthC: 1, mouthO: 0, waves: 0, zs: 1 },
  slow: { earL: 4, earR: -4, closed: 0, open: 1, browL: -14, browR: 14, mouthC: 1, mouthO: 0, waves: 0, zs: 0 },
  down: { earL: -14, earR: 14, closed: 0, open: 1, browL: 16, browR: -16, mouthC: 0, mouthO: 1, waves: 1, zs: 0 },
};

const part = (root, name) => root.querySelector(`[data-part="${name}"]`);

export const poseTargets = (root, mode) => {
  const s = POSES[mode];

  return [
    [part(root, "earL"), { rotation: s.earL }],
    [part(root, "earR"), { rotation: s.earR }],
    [part(root, "eyesClosed"), { opacity: s.closed }],
    [part(root, "eyesOpen"), { opacity: s.open }],
    [part(root, "browL"), { rotation: s.browL }],
    [part(root, "browR"), { rotation: s.browR }],
    [part(root, "mouthClosed"), { opacity: s.mouthC }],
    [part(root, "mouthOpen"), { opacity: s.mouthO }],
    [part(root, "waves"), { opacity: s.waves }],
    [part(root, "zs"), { opacity: s.zs }],
  ];
};

export const setPose = (gsap, root, mode) => {
  poseTargets(root, mode).forEach(([el, vars]) => gsap.set(el, vars));
};

export const applyPose = (gsap, root, mode, duration) => {
  poseTargets(root, mode).forEach(([el, vars]) => {
    gsap.to(el, {
      ...vars,
      duration,
      ease: "rotation" in vars ? "back.out(2)" : "power2.out",
      overwrite: "auto",
    });
  });
};

export const posePair = (tl, root, from, to, at, duration) => {
  const start = poseTargets(root, from);
  const end = poseTargets(root, to);

  start.forEach(([el, vars], i) => {
    tl.fromTo(
      el,
      vars,
      { ...end[i][1], duration, ease: "power1.inOut", immediateRender: false },
      at,
    );
  });
};

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
