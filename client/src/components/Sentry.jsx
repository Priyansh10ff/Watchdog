import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import gsap from "gsap";
import { applyPose, prefersReducedMotion, setPose } from "../utils/sentryPose";

const INK = "#101536";
const BUTTER = "#ffe45e";
const EAR = "#b8692a";

const abs = (left, top, width, height, extra = {}) => ({
  position: "absolute",
  left,
  top,
  width,
  height,
  ...extra,
});

const full = (extra = {}) => abs(0, 0, 560, 600, extra);

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

const earStyle = (left, origin) =>
  abs(left, 72, 140, 220, {
    background: EAR,
    borderRadius: "50% 50% 55% 55% / 35% 35% 65% 65%",
    transformOrigin: origin,
  });

const closedEye = (left) => (
  <div
    style={abs(left, 292, 84, 38, {
      borderBottom: `8px solid ${INK}`,
      borderRadius: "0 0 84px 84px / 0 0 38px 38px",
      boxSizing: "border-box",
    })}
  />
);

const eye = (left) => (
  <div
    data-part="ball"
    style={abs(left, 250, 84, 84, {
      background: "#ffffff",
      borderRadius: "50%",
      overflow: "hidden",
    })}
  >
    <div
      data-part="pupil"
      style={abs(23, 23, 38, 38, { background: INK, borderRadius: "50%" })}
    />
    <div
      data-part="pupil"
      style={abs(40, 24, 12, 12, { background: "#ffffff", borderRadius: "50%" })}
    />
  </div>
);

const wave = (left, side, origin) => (
  <div
    data-part="wave"
    style={abs(left, 300, 70, 140, {
      [side]: `10px solid ${BUTTER}`,
      borderRadius: "50%",
      boxSizing: "border-box",
      transformOrigin: origin,
    })}
  />
);

const zLetter = (left, top, size) => (
  <div
    data-part="z"
    className="font-display font-extrabold"
    style={{
      position: "absolute",
      left,
      top,
      fontSize: size,
      color: BUTTER,
      opacity: 0,
    }}
  >
    z
  </div>
);

const Sentry = forwardRef(({ mode = "up", scale = 1, intro = false }, ref) => {
  const rootRef = useRef(null);
  const modeRef = useRef(mode);
  const firstMode = useRef(true);
  const bark = useRef(null);
  const quick = useRef(null);

  useImperativeHandle(
    ref,
    () => ({
      getRoot: () => rootRef.current,
      lookAt: (nx, ny) => {
        const q = quick.current;
        if (!q) return;
        q.px(clamp(nx * 10, 10));
        q.py(clamp(ny * 8, 8));
        q.rot(nx * 3);
        q.ty(ny * 8);
      },
    }),
    [],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduce = prefersReducedMotion();
    const one = (name) => root.querySelector(`[data-part="${name}"]`);
    const all = (name) => Array.from(root.querySelectorAll(`[data-part="${name}"]`));

    const ctx = gsap.context(() => {
      setPose(gsap, root, modeRef.current);

      const shake = one("shake");
      const jaw = one("jaw");

      const shakeTl = gsap.timeline({ paused: true, repeat: -1 });
      [[-6, 2], [5, -3], [-4, -2], [4, 3], [-3, 1], [0, 0]].forEach(([x, y]) => {
        shakeTl.to(shake, { x, y, duration: 0.05, ease: "none" });
      });

      const waveTl = gsap.timeline({ paused: true, repeat: -1 });
      all("wave").forEach((w, i) => {
        waveTl.fromTo(
          w,
          { scale: 0.6, opacity: 0.95 },
          { scale: 1.5, opacity: 0, duration: 1.1, ease: "power1.out" },
          (i % 3) * 0.35,
        );
      });

      const jawTl = gsap.timeline({ paused: true, repeat: -1, yoyo: true });
      jawTl.fromTo(jaw, { scaleY: 1 }, { scaleY: 0.5, duration: 0.19, ease: "sine.inOut" });

      bark.current = { shakeTl, waveTl, jawTl, shake, jaw };

      if (reduce) return;

      if (intro) {
        gsap.from(root, {
          scale: 0.5,
          rotation: -10,
          opacity: 0,
          duration: 1.5,
          ease: "elastic.out(1, 0.55)",
          delay: 0.35,
        });
      }

      gsap.to(one("breath"), {
        scale: 1.02,
        duration: 1.8,
        yoyo: true,
        repeat: -1,
        ease: "sine.inOut",
      });

      all("z").forEach((z, i) => {
        gsap
          .timeline({ repeat: -1, delay: i * 0.9 })
          .fromTo(z, { opacity: 0, x: 0, y: 0, scale: 0.6 }, { opacity: 1, duration: 0.5, ease: "none" }, 0)
          .to(z, { x: 46, y: -120, scale: 1.3, duration: 3.2, ease: "power1.in" }, 0)
          .to(z, { opacity: 0, duration: 2.4, ease: "none" }, 0.8);
      });

      const balls = all("ball");
      const blink = () => {
        gsap.to(balls, {
          scaleY: 0.08,
          duration: 0.07,
          yoyo: true,
          repeat: 1,
          onComplete: () => gsap.delayedCall(2 + Math.random() * 3, blink),
        });
      };
      gsap.delayedCall(2.5, blink);

      const pupils = all("pupil");
      const tilt = one("tilt");
      quick.current = {
        px: gsap.quickTo(pupils, "x", { duration: 0.35, ease: "power3" }),
        py: gsap.quickTo(pupils, "y", { duration: 0.35, ease: "power3" }),
        rot: gsap.quickTo(tilt, "rotation", { duration: 0.8, ease: "power3" }),
        ty: gsap.quickTo(tilt, "y", { duration: 0.8, ease: "power3" }),
      };

      if (modeRef.current === "down") {
        shakeTl.play();
        waveTl.play();
        jawTl.play();
      }
    }, root);

    return () => {
      ctx.revert();
      bark.current = null;
      quick.current = null;
    };
  }, []);

  useEffect(() => {
    modeRef.current = mode;

    if (firstMode.current) {
      firstMode.current = false;
      return;
    }

    const root = rootRef.current;
    if (!root) return;

    const reduce = prefersReducedMotion();
    applyPose(gsap, root, mode, reduce ? 0.01 : 0.6);

    const b = bark.current;
    if (!b || reduce) return;

    if (mode === "down") {
      b.shakeTl.play();
      b.waveTl.play();
      b.jawTl.play();
    } else {
      b.shakeTl.pause();
      b.waveTl.pause();
      b.jawTl.pause();
      gsap.to(b.shake, { x: 0, y: 0, duration: 0.2 });
      gsap.to(b.jaw, { scaleY: 1, duration: 0.2 });
    }
  }, [mode]);

  return (
    <div style={{ width: 560 * scale, height: 600 * scale }} aria-hidden="true">
      <div
        style={{
          width: 560,
          height: 600,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        <div
          ref={rootRef}
          style={{ position: "relative", width: 560, height: 600 }}
        >
          <div data-part="tilt" style={{ position: "relative", width: 560, height: 600 }}>
            <div data-part="breath" style={full({ transformOrigin: "50% 90%" })}>
              <div data-part="shake" style={full()}>
                <div data-part="earL" style={earStyle(34, "70% 12%")} />
                <div data-part="earR" style={earStyle(386, "30% 12%")} />
                <div
                  style={abs(80, 142, 400, 360, {
                    background: "#ffcf86",
                    borderRadius: "48% 48% 46% 46% / 50% 50% 50% 50%",
                  })}
                />
                <div
                  style={abs(112, 208, 150, 150, { background: EAR, borderRadius: "50%" })}
                />

                <div data-part="eyesClosed" style={full()}>
                  {closedEye(148)}
                  {closedEye(330)}
                </div>

                <div data-part="eyesOpen" style={full({ opacity: 0 })}>
                  {eye(148)}
                  {eye(330)}
                  <div
                    data-part="browL"
                    style={abs(150, 222, 80, 12, { background: INK, borderRadius: 8 })}
                  />
                  <div
                    data-part="browR"
                    style={abs(332, 222, 80, 12, { background: INK, borderRadius: 8 })}
                  />
                </div>

                <div
                  style={abs(150, 342, 260, 170, {
                    background: "#fff0cf",
                    borderRadius: "50% 50% 58% 58% / 45% 45% 55% 55%",
                  })}
                />
                <div
                  style={abs(232, 334, 96, 66, {
                    background: INK,
                    borderRadius: "50% 50% 60% 60%",
                  })}
                />
                <div
                  style={abs(252, 345, 26, 12, {
                    background: "#ffffff",
                    borderRadius: "50%",
                    opacity: 0.75,
                  })}
                />

                <div data-part="mouthClosed" style={full()}>
                  <div
                    style={abs(277, 398, 7, 26, { background: INK, borderRadius: 4 })}
                  />
                  <div
                    style={abs(246, 410, 68, 32, {
                      borderBottom: `7px solid ${INK}`,
                      borderRadius: "0 0 40px 40px",
                      boxSizing: "border-box",
                    })}
                  />
                </div>

                <div data-part="mouthOpen" style={full({ opacity: 0 })}>
                  <div
                    data-part="jaw"
                    style={abs(226, 402, 108, 116, {
                      background: "#3a1020",
                      borderRadius: "0 0 54px 54px / 0 0 70px 70px",
                      overflow: "hidden",
                      transformOrigin: "top center",
                    })}
                  >
                    <div
                      style={abs(19, 62, 70, 70, {
                        background: "#ff6b6b",
                        borderRadius: "50%",
                      })}
                    />
                  </div>
                </div>

                <div data-part="waves" style={full({ opacity: 0 })}>
                  {wave(500, "borderRight", "left center")}
                  {wave(500, "borderRight", "left center")}
                  {wave(500, "borderRight", "left center")}
                  {wave(-10, "borderLeft", "right center")}
                  {wave(-10, "borderLeft", "right center")}
                </div>

                <div data-part="zs" style={full()}>
                  {zLetter(448, 150, 54)}
                  {zLetter(470, 120, 40)}
                  {zLetter(490, 96, 30)}
                </div>

                <div
                  data-part="collar"
                  style={abs(120, 500, 320, 56, {
                    background: "#ff6a4d",
                    borderRadius: 28,
                  })}
                />
                <div
                  className="font-display font-extrabold"
                  style={abs(248, 528, 64, 64, {
                    background: BUTTER,
                    border: `5px solid ${INK}`,
                    borderRadius: "50%",
                    boxSizing: "border-box",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    color: INK,
                  })}
                >
                  W
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

Sentry.displayName = "Sentry";

export default Sentry;
