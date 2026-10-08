import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Logo from "../components/Logo";
import Sentry from "../components/Sentry";
import SentryAvatar from "../components/SentryAvatar";
import { posePair, prefersReducedMotion } from "../utils/sentryPose";
import { butterBtn, inkBtn } from "../components/ui";

gsap.registerPlugin(ScrollTrigger);

const COPY = {
  up: {
    word: "napping.",
    sub: "All your sites are up. Watchdog checks each one on a schedule and wakes Sentry the second one stops answering.",
  },
  slow: {
    word: "listening.",
    sub: "A site is still answering, but slowly. Sentry keeps watching and will bark if it stops.",
  },
  down: {
    word: "barking.",
    sub: "A site stopped responding. Watchdog opens one incident and tracks it until the site recovers.",
  },
};

const MODES = [
  { id: "up", label: "All up" },
  { id: "slow", label: "Slow" },
  { id: "down", label: "Down" },
];

const STEPS = [
  {
    n: "1 of 4",
    title: "Add your sites",
    text: "Paste a URL. Sentry starts watching it right away.",
  },
  {
    n: "2 of 4",
    title: "Sentry checks them",
    text: "Every monitor is checked on the schedule you set. A healthy site gets a green light.",
  },
  {
    n: "3 of 4",
    title: "One goes down",
    text: "After a few failed checks in a row, Sentry barks and Watchdog opens one incident. Not fifty.",
  },
  {
    n: "4 of 4",
    title: "It recovers",
    text: "When the site answers again the incident closes by itself, with its duration, and Sentry goes back to sleep.",
  },
];

const bars = [38, 46, 34, 52, 40, 44, 36, 58, 42, 48, 36, 50];

const chipBase = "inline-flex h-9 items-center rounded-full px-3.5 text-[14px] font-semibold";

const CALM = [
  {
    title: "Checks on your schedule",
    text: "Every monitor has its own interval, from every minute to every hour, and you can check one on demand.",
    visual: (
      <>
        <div className="flex flex-wrap gap-2">
          <span className={`${chipBase} border-2 border-ink/20 text-soft`}>1 min</span>
          <span className={`${chipBase} bg-ink text-butter`}>5 min</span>
          <span className={`${chipBase} border-2 border-ink/20 text-soft`}>15 min</span>
          <span className={`${chipBase} border-2 border-ink/20 text-soft`}>1 hour</span>
        </div>
        <div className="mt-8 flex h-[74px] items-end gap-1.5">
          {bars.map((height, i) => (
            <span key={i} className="flex-1 rounded-[5px] bg-[#3ddc84]" style={{ height }} />
          ))}
        </div>
      </>
    ),
  },
  {
    title: "No false alarms",
    text: "One dropped request is not an outage. A site is called down only after the failures you choose in a row.",
    visual: (
      <>
        <div className="flex items-center gap-2">
          <span className={`${chipBase} bg-[#d3f5e2] font-bold text-[#0b5a32]`}>Up</span>
          <span className={`${chipBase} bg-[#ffd9d0] font-bold text-[#8a1f0d]`}>Fail</span>
          <span className={`${chipBase} bg-[#ffd9d0] font-bold text-[#8a1f0d]`}>Fail</span>
          <span className={`${chipBase} bg-[#ffd9d0] font-bold text-[#8a1f0d]`}>Fail</span>
        </div>
        <div className="mt-7 flex items-center gap-3">
          <span className="inline-flex h-10 items-center rounded-full bg-[#c8321a] px-[18px] text-[15px] font-bold text-white">
            Down
          </span>
          <span className="text-[15px] font-semibold text-soft">after 3 failures in a row</span>
        </div>
        <div className="mt-5 h-1.5 rounded-[3px] bg-ink/10">
          <div className="h-1.5 w-full rounded-[3px] bg-[#c8321a]" />
        </div>
      </>
    ),
  },
  {
    title: "One incident per outage",
    text: "Watchdog opens one incident, tracks it with the cause, and closes it with the duration when the site recovers.",
    visual: (
      <>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-bold">API</span>
          <span className="inline-flex h-[30px] items-center rounded-full bg-[#c8321a] px-3 text-[13px] font-bold text-white">
            Open
          </span>
        </div>
        <div className="mt-1.5 text-[14px] text-soft">Started 14:02, 3 failed checks</div>
        <div className="my-[18px] h-0.5 bg-ink/10" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-[17px] font-bold">API</span>
          <span className="inline-flex h-[30px] items-center rounded-full bg-[#d3f5e2] px-3 text-[13px] font-bold text-[#0b5a32]">
            Resolved
          </span>
        </div>
        <div className="mt-1.5 text-[14px] text-soft">Lasted 12 min, closed automatically</div>
      </>
    ),
  },
];

const SITES = [
  { name: "Marketing site", ms: 138, top: 150 },
  { name: "Shop", ms: 201, top: 290 },
  { name: "Blog", ms: 96, top: 430 },
  { name: "API", ms: 112, top: 570, api: true },
];

const TILES = [
  { id: "site", name: "Marketing site", url: "example.com", ms: 138 },
  { id: "shop", name: "Shop", url: "shop.example.com", ms: 201 },
  { id: "blog", name: "Blog", url: "blog.example.com", ms: 96 },
  { id: "docs", name: "Docs", url: "docs.example.com", ms: 154 },
  { id: "status", name: "Status page", url: "status.example.com", ms: 77 },
  { id: "api", name: "API", url: "api.example.com", ms: 112, api: true },
];

const abs = (left, top, width, height, extra = {}) => ({
  position: "absolute",
  left,
  top,
  width,
  height,
  ...extra,
});

const Landing = () => {
  const [mode, setMode] = useState("up");
  const [broken, setBroken] = useState(false);
  const [flat, setFlat] = useState(false);

  const rootRef = useRef(null);
  const heroRig = useRef(null);
  const storyRig = useRef(null);
  const wordRef = useRef(null);
  const subRef = useRef(null);
  const apiTile = useRef(null);
  const quick = useRef(null);
  const shownMode = useRef(mode);
  const shownBroken = useRef(broken);

  const down = mode === "down";

  useEffect(() => {
    if (shownMode.current === mode) return;
    shownMode.current = mode;
    if (prefersReducedMotion()) return;
    gsap.fromTo(wordRef.current, { yPercent: 110 }, { yPercent: 0, duration: 0.55, ease: "power4.out" });
    gsap.fromTo(subRef.current, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.45 });
  }, [mode]);

  useEffect(() => {
    if (shownBroken.current === broken) return;
    shownBroken.current = broken;
    if (!broken || !apiTile.current || prefersReducedMotion()) return;
    gsap.fromTo(
      apiTile.current,
      { x: 0 },
      {
        keyframes: [
          { x: -10, duration: 0.06 },
          { x: 9, duration: 0.06 },
          { x: -7, duration: 0.06 },
          { x: 6, duration: 0.06 },
          { x: -3, duration: 0.06 },
          { x: 0, duration: 0.06 },
        ],
        ease: "none",
      },
    );
  }, [broken]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduce = prefersReducedMotion();
    const wide = window.innerWidth >= 1280;
    if (reduce) setFlat(true);

    const one = (sel) => root.querySelector(sel);
    const all = (sel) => Array.from(root.querySelectorAll(sel));

    const ctx = gsap.context(() => {
      const spot = one('[data-g="spot"]');
      quick.current = {
        sx: gsap.quickTo(spot, "x", { duration: 0.6, ease: "power3" }),
        sy: gsap.quickTo(spot, "y", { duration: 0.6, ease: "power3" }),
      };

      if (reduce) return;

      gsap.from(one('[data-g="navi"]'), { y: -24, opacity: 0, duration: 0.7, ease: "power3.out" });
      gsap.from(all('[data-g="hw"]'), { yPercent: 115, duration: 1.1, ease: "power4.out", stagger: 0.12, delay: 0.15 });
      gsap.from(all('[data-g="ctl"]'), { y: 26, opacity: 0, duration: 0.8, stagger: 0.1, delay: 0.7, ease: "power3.out" });
      gsap.from(all('[data-g="chip"]'), { scale: 0, opacity: 0, duration: 0.6, ease: "back.out(2)", stagger: 0.12, delay: 1.1 });

      all('[data-g="chip"]').forEach((chip, i) => {
        gsap.to(chip, {
          y: "+=14",
          x: i % 2 ? "-=8" : "+=8",
          rotation: i % 2 ? -2 : 2,
          duration: 2.2 + i * 0.4,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
          delay: 1.8,
        });
      });

      const hero = one('[data-g="hero"]');
      gsap.to(one('[data-g="dogwrap"]'), {
        y: -80,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
      });

      gsap.from(all('[data-g="tile"]'), {
        y: 70,
        opacity: 0,
        duration: 0.8,
        stagger: 0.1,
        ease: "power3.out",
        scrollTrigger: { trigger: one('[data-g="tiles"]'), start: "top 85%", toggleActions: "play none none reverse" },
      });

      if (!wide || !storyRig.current) return;

      const rigRoot = storyRig.current.getRoot();
      const part = (name) => rigRoot.querySelector(`[data-part="${name}"]`);
      const parts = (name) => Array.from(rigRoot.querySelectorAll(`[data-part="${name}"]`));

      const stage = one('[data-g="stage"]');
      const text = one('[data-g="text"]');
      const rail = one('[data-g="rail"]');
      const railFill = one('[data-g="railfill"]');
      const caps = all('[data-g="cap"]');
      const sites = all("[data-site]");
      const rings = all('[data-g="ring"]');
      const apiCard = one('[data-api="card"]');
      const apiLamp = one('[data-api="lamp"]');
      const apiB = apiCard.querySelector("[data-stb]");
      const apiC = one('[data-api="c"]');
      const apiD = one('[data-api="d"]');
      const token1 = one('[data-g="token1"]');
      const token2 = one('[data-g="token2"]');
      const panel = one('[data-g="panel"]');
      const ip = all("[data-ip]");
      const shakeEl = part("shake");
      const jaw = part("jaw");
      const collar = part("collar");

      gsap.set(sites, { x: 420, opacity: 0 });
      gsap.set(railFill, { scaleX: 0, transformOrigin: "left center" });
      gsap.set([token1, token2], { scale: 0.4 });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: { trigger: one('[data-g="story"]'), start: "top top", end: "bottom bottom", scrub: 1 },
      });
      const seg = (target, from, to, at) => tl.fromTo(target, from, { ...to, immediateRender: false }, at);

      seg(railFill, { scaleX: 0 }, { scaleX: 1, duration: 12 }, 0);
      seg(sites, { x: 420, opacity: 0 }, { x: 0, opacity: 1, duration: 1, stagger: 0.3, ease: "power3.out" }, 0.2);

      const capIn = [3, 6.2, 9.2];
      const capOut = [2.6, 5.8, 8.8];
      caps.forEach((c, i) => {
        if (i > 0) seg(c, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6 }, capIn[i - 1]);
        if (i < caps.length - 1) seg(c, { opacity: 1, y: 0 }, { opacity: 0, y: -40, duration: 0.6 }, capOut[i]);
      });

      posePair(tl, rigRoot, "up", "slow", 3.2, 0.5);
      rings.forEach((r, i) => {
        seg(r, { scale: 0.2, opacity: 0.9 }, { scale: 3, opacity: 0, duration: 1.4, ease: "power1.out" }, 3.5 + i * 0.5);
      });
      sites.forEach((s, i) => {
        const at = 4 + i * 0.35;
        seg(s.querySelector("[data-lamp]"), { backgroundColor: "#b9b6c8" }, { backgroundColor: "#3ddc84", duration: 0.3 }, at);
        seg(s.querySelector("[data-sta]"), { opacity: 1 }, { opacity: 0, duration: 0.2 }, at);
        seg(s.querySelector("[data-stb]"), { opacity: 0 }, { opacity: 1, duration: 0.2 }, at + 0.1);
      });
      posePair(tl, rigRoot, "slow", "up", 5.6, 0.6);

      seg(stage, { backgroundColor: "#2b46ff" }, { backgroundColor: "#ff5a3c", duration: 0.6 }, 6.2);
      seg(text, { color: "#ffffff" }, { color: "#101536", duration: 0.6 }, 6.2);
      seg(rail, { color: "#ffffff" }, { color: "#101536", duration: 0.6 }, 6.2);
      posePair(tl, rigRoot, "up", "down", 6.4, 0.4);
      seg(collar, { backgroundColor: "#ff6a4d" }, { backgroundColor: "#101536", duration: 0.4 }, 6.4);
      seg(apiLamp, { backgroundColor: "#3ddc84" }, { backgroundColor: "#ff4b3a", duration: 0.3 }, 6.6);
      seg(apiCard, { backgroundColor: "#ffffff" }, { backgroundColor: "#ffd9d0", duration: 0.3 }, 6.6);
      seg(apiB, { opacity: 1 }, { opacity: 0, duration: 0.2 }, 6.6);
      seg(apiC, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 6.7);

      for (let i = 0; i < 10; i++) {
        seg(jaw, { scaleY: 1 }, { scaleY: 0.5, duration: 0.1 }, 6.6 + i * 0.2);
        seg(jaw, { scaleY: 0.5 }, { scaleY: 1, duration: 0.1 }, 6.7 + i * 0.2);
      }
      [-8, 8, -6, 6, -4, 4, 0, -8, 8, -6, 6, -4, 4, 0].forEach((x, i) => {
        seg(shakeEl, { x: 0 }, { x, duration: 0.07 }, 6.6 + i * 0.07);
      });
      parts("wave").forEach((w, i) => {
        seg(w, { scale: 0.6, opacity: 0.95 }, { scale: 1.5, opacity: 0, duration: 0.9, ease: "power1.out" }, 6.6 + (i % 3) * 0.3);
        seg(w, { scale: 0.6, opacity: 0.95 }, { scale: 1.5, opacity: 0, duration: 0.9, ease: "power1.out" }, 7.6 + (i % 3) * 0.3);
      });

      seg(token1, { opacity: 0, scale: 0.4, x: 0, y: 0, rotation: 0 }, { opacity: 1, scale: 1, duration: 0.3 }, 7.4);
      seg(token1, { x: 0, y: 0, rotation: 0 }, { x: 500, y: -410, rotation: -6, duration: 1.1, ease: "power2.inOut" }, 7.7);
      seg(token1, { opacity: 1 }, { opacity: 0, duration: 0.25 }, 8.7);
      seg(ip[0], { opacity: 1 }, { opacity: 0, duration: 0.15 }, 8.8);
      seg(ip[1], { opacity: 0 }, { opacity: 1, duration: 0.15 }, 8.8);
      seg(panel, { scale: 1 }, { scale: 1.06, duration: 0.15 }, 8.8);
      seg(panel, { scale: 1.06 }, { scale: 1, duration: 0.2 }, 8.95);

      seg(stage, { backgroundColor: "#ff5a3c" }, { backgroundColor: "#2b46ff", duration: 0.6 }, 9.2);
      seg(text, { color: "#101536" }, { color: "#ffffff", duration: 0.6 }, 9.2);
      seg(rail, { color: "#101536" }, { color: "#ffffff", duration: 0.6 }, 9.2);
      posePair(tl, rigRoot, "down", "up", 9.6, 0.6);
      seg(collar, { backgroundColor: "#101536" }, { backgroundColor: "#ff6a4d", duration: 0.4 }, 9.6);
      seg(apiLamp, { backgroundColor: "#ff4b3a" }, { backgroundColor: "#3ddc84", duration: 0.3 }, 9.9);
      seg(apiCard, { backgroundColor: "#ffd9d0" }, { backgroundColor: "#ffffff", duration: 0.3 }, 9.9);
      seg(apiC, { opacity: 1 }, { opacity: 0, duration: 0.2 }, 9.9);
      seg(apiD, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 10);

      seg(token2, { opacity: 0, scale: 0.4, x: 0, y: 0, rotation: 0 }, { opacity: 1, scale: 1, duration: 0.3 }, 10.2);
      seg(token2, { x: 0, y: 0, rotation: 0 }, { x: 500, y: -410, rotation: -6, duration: 1.1, ease: "power2.inOut" }, 10.5);
      seg(token2, { opacity: 1 }, { opacity: 0, duration: 0.25 }, 11.5);
      seg(ip[1], { opacity: 1 }, { opacity: 0, duration: 0.15 }, 11.6);
      seg(ip[2], { opacity: 0 }, { opacity: 1, duration: 0.15 }, 11.6);
      seg(panel, { scale: 1 }, { scale: 1.06, duration: 0.15 }, 11.6);
      seg(panel, { scale: 1.06 }, { scale: 1, duration: 0.2 }, 11.75);

      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => ScrollTrigger.refresh());
      }
    }, root);

    return () => {
      ctx.revert();
      quick.current = null;
    };
  }, []);

  const handleHeroMove = (e) => {
    if (prefersReducedMotion()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    heroRig.current?.lookAt(nx, ny);
    if (quick.current) {
      quick.current.sx(e.clientX - rect.left);
      quick.current.sy(e.clientY - rect.top);
      const spot = rootRef.current?.querySelector('[data-g="spot"]');
      if (spot && spot.style.opacity !== "1") gsap.to(spot, { opacity: 1, duration: 0.6 });
    }
  };

  const tileMove = (e) => {
    if (prefersReducedMotion()) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    gsap.to(e.currentTarget, {
      rotationY: nx * 9,
      rotationX: -ny * 9,
      y: -6,
      transformPerspective: 900,
      duration: 0.35,
      ease: "power2.out",
    });
  };

  const tileLeave = (e) => {
    gsap.to(e.currentTarget, { rotationY: 0, rotationX: 0, y: 0, duration: 0.5, ease: "power3.out" });
  };

  const chip =
    "absolute z-[3] flex items-center gap-2.5 rounded-full px-[18px] py-2.5 text-[15px] font-bold shadow-[0_18px_36px_-16px_rgba(16,21,54,0.6)] transition-colors duration-500";

  return (
    <div ref={rootRef} className="bg-cream font-sans text-ink">
      <section
        data-g="hero"
        onMouseMove={handleHeroMove}
        className={`relative overflow-hidden transition-colors duration-500 ${
          down ? "bg-coral text-ink" : "bg-cobalt text-white"
        }`}
      >
        <div
          data-g="spot"
          className="pointer-events-none absolute left-0 top-0 h-[700px] w-[700px] rounded-full opacity-0"
          style={{
            margin: "-350px 0 0 -350px",
            background: "radial-gradient(circle, rgba(255,255,255,.16), rgba(255,255,255,0) 62%)",
          }}
        />

        <div className="relative mx-auto max-w-[1312px] px-6 pt-5 sm:px-16">
          <nav
            data-g="navi"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-[34px] border px-5 py-3 backdrop-blur-md transition-colors duration-500 md:grid md:h-[68px] md:grid-cols-[1fr_auto_1fr] md:rounded-full md:py-0 md:pl-5 md:pr-3 ${
              down ? "border-ink/20 bg-white/25" : "border-white/25 bg-white/10"
            }`}
          >
            <Link to="/" className="w-fit">
              <Logo />
            </Link>
            <div className="hidden items-center gap-9 text-[16px] font-medium md:flex">
              <a href="#how" className="transition-opacity hover:opacity-70">
                How it works
              </a>
              <a href="#features" className="transition-opacity hover:opacity-70">
                Features
              </a>
            </div>
            <div className="flex items-center justify-end gap-5">
              <Link to="/login" className="text-[16px] font-semibold transition-opacity hover:opacity-70">
                Log in
              </Link>
              <Link
                to="/signup"
                className={`inline-flex h-[46px] items-center rounded-full px-6 text-[15px] font-bold transition-colors ${
                  down ? "bg-ink text-butter hover:bg-white hover:text-ink" : "bg-butter text-ink hover:bg-white"
                }`}
              >
                Start monitoring
              </Link>
            </div>
          </nav>

          <div className="flex flex-wrap items-center justify-between gap-8 pb-20 pt-14 lg:pb-24 lg:pt-16">
            <div className="max-w-[640px] flex-1 basis-[460px]">
              <h1 className="font-display text-[clamp(56px,8.4vw,108px)] font-extrabold leading-[0.94] tracking-[-0.04em]">
                <span className="inline-block overflow-hidden pb-[0.1em] align-top">
                  <span data-g="hw" className="inline-block">Sentry</span>
                </span>{" "}
                <span className="inline-block overflow-hidden pb-[0.1em] align-top">
                  <span data-g="hw" className="inline-block">is</span>
                </span>{" "}
                <span className="inline-block overflow-hidden pb-[0.1em] align-top">
                  <span data-g="hw" ref={wordRef} className="inline-block">
                    {COPY[mode].word}
                  </span>
                </span>
              </h1>
              <p
                ref={subRef}
                data-g="ctl"
                className="mt-7 max-w-[500px] text-[clamp(18px,1.6vw,21px)] font-medium leading-normal"
              >
                {COPY[mode].sub}
              </p>

              <div data-g="ctl" className="mt-9 flex flex-wrap items-center gap-3">
                <span className="mr-1 text-[16px] font-semibold">Try it</span>
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={mode === item.id}
                    onClick={() => setMode(item.id)}
                    className={`inline-flex h-12 items-center rounded-full border-2 border-current px-6 text-[16px] font-bold transition-colors ${
                      mode === item.id ? "bg-butter text-ink" : "bg-transparent"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div data-g="dogwrap" className="relative hidden h-[500px] w-[470px] shrink-0 lg:block">
              <div className={`${chip} bg-white text-ink`} data-g="chip" style={{ left: -40, top: 330 }}>
                <span className="block h-3 w-3 rounded-full bg-[#3ddc84]" />
                example.com <span className="font-medium text-soft">138 ms</span>
              </div>
              <div className={`${chip} bg-white text-ink`} data-g="chip" style={{ left: 330, top: 8 }}>
                <span className="block h-3 w-3 rounded-full bg-[#3ddc84]" />
                shop.example.com <span className="font-medium text-soft">201 ms</span>
              </div>
              <div
                className={`${chip} ${down ? "bg-ink text-white" : "bg-white text-ink"}`}
                data-g="chip"
                style={{ left: 300, top: 440 }}
              >
                <span className={`block h-3 w-3 rounded-full ${down ? "bg-[#ff4b3a]" : "bg-[#3ddc84]"}`} />
                api.example.com{" "}
                <span className={`font-medium ${down ? "text-white/80" : "text-soft"}`}>
                  {down ? "No reply" : mode === "slow" ? "1,840 ms" : "112 ms"}
                </span>
              </div>
              <Sentry ref={heroRig} mode={mode} scale={0.83} intro />
            </div>

            <div className="mx-auto lg:hidden">
              <Sentry mode={mode} scale={0.62} />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-24 lg:py-28">
        <div className="mx-auto max-w-[1312px] px-6 sm:px-16">
          <h2 className="max-w-[760px] font-display text-[clamp(38px,5vw,60px)] font-extrabold leading-none tracking-[-2px]">
            Built to stay calm when your site is not.
          </h2>
          <p className="mt-4 max-w-[560px] text-[20px] leading-normal text-soft">
            Three ideas keep Watchdog quiet until something is really wrong.
          </p>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {CALM.map((card) => (
              <div
                key={card.title}
                className="flex flex-col rounded-[32px] bg-white p-8 shadow-[0_24px_48px_-28px_rgba(16,21,54,0.3)] transition-transform duration-300 hover:-translate-y-1.5"
              >
                <div className="min-h-[190px] flex-1 rounded-[22px] bg-cream p-[22px]">{card.visual}</div>
                <h3 className="mt-6 font-display text-[27px] font-extrabold tracking-[-0.8px]">{card.title}</h3>
                <p className="mt-2 text-[17px] leading-normal text-soft">{card.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how">
        <div data-g="story" className={flat ? "hidden" : "relative hidden h-[5100px] xl:block"}>
          <div
            data-g="stage"
            className="sticky top-0 h-[900px] overflow-hidden"
            style={{ backgroundColor: "#2b46ff" }}
          >
            <div className="relative mx-auto h-[800px] w-[1312px]" style={{ top: 50 }}>
              <div data-g="text" className="absolute left-0 top-[200px] w-[440px] text-white">
                {STEPS.map((step, i) => (
                  <div
                    key={step.title}
                    data-g="cap"
                    className="absolute left-0 top-0 w-[440px]"
                    style={{ opacity: i === 0 ? 1 : 0 }}
                  >
                    <div className={`text-[18px] font-bold ${i === 2 ? "text-ink" : "text-butter"}`}>
                      {step.n}
                    </div>
                    <h2 className="mt-3 font-display text-[76px] font-extrabold leading-[0.95] tracking-[-3px]">
                      {step.title}
                    </h2>
                    <p className="mt-5 text-[20px] leading-normal">{step.text}</p>
                  </div>
                ))}
              </div>

              <div data-g="rail" className="absolute left-0 top-[700px] h-1 w-[440px] text-white">
                <div className="absolute inset-0 bg-current opacity-25" />
                <div data-g="railfill" className="absolute inset-0 bg-current" />
              </div>

              <div className="pointer-events-none absolute inset-0">
                {[0, 1, 2].map((ring) => (
                  <div
                    key={ring}
                    data-g="ring"
                    style={abs(476, 250, 300, 300, {
                      border: "5px solid #ffe45e",
                      borderRadius: "50%",
                      boxSizing: "border-box",
                      opacity: 0,
                    })}
                  />
                ))}
              </div>

              <div style={abs(430, 190, 392, 420)}>
                <Sentry ref={storyRig} mode="up" scale={0.7} />
              </div>

              <div
                data-g="panel"
                className="absolute flex items-center justify-between gap-4 rounded-[28px] bg-white px-6 text-ink shadow-[0_22px_40px_-18px_rgba(16,21,54,0.6)]"
                style={{ left: 1000, top: 30, width: 312, height: 100 }}
              >
                <div>
                  <div className="text-[18px] font-bold">Incidents</div>
                  <div className="relative h-[22px] w-[220px] text-[15px] text-soft">
                    <span data-ip className="absolute left-0 top-0">None open</span>
                    <span data-ip className="absolute left-0 top-0 font-bold text-[#a3200c]" style={{ opacity: 0 }}>
                      API: incident open
                    </span>
                    <span data-ip className="absolute left-0 top-0" style={{ opacity: 0 }}>
                      API: resolved
                    </span>
                  </div>
                </div>
              </div>

              {SITES.map((site) => (
                <div
                  key={site.name}
                  data-site
                  {...(site.api ? { "data-api": "card" } : {})}
                  className="absolute flex items-center gap-4 rounded-[26px] px-6 text-ink shadow-[0_22px_40px_-20px_rgba(16,21,54,0.55)]"
                  style={{ left: 1000, top: site.top, width: 312, height: 110, backgroundColor: "#ffffff" }}
                >
                  <span
                    data-lamp
                    {...(site.api ? { "data-api": "lamp" } : {})}
                    className="block h-5 w-5 shrink-0 rounded-full"
                    style={{ backgroundColor: "#b9b6c8" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[19px] font-bold">{site.name}</div>
                    <div className="relative h-[22px] text-[15px] text-soft">
                      <span data-sta className="absolute left-0 top-0">Waiting</span>
                      <span data-stb className="absolute left-0 top-0" style={{ opacity: 0 }}>
                        Up, {site.ms} ms
                      </span>
                      {site.api && (
                        <>
                          <span
                            data-api="c"
                            className="absolute left-0 top-0 font-bold text-[#a3200c]"
                            style={{ opacity: 0 }}
                          >
                            No reply
                          </span>
                          <span data-api="d" className="absolute left-0 top-0" style={{ opacity: 0 }}>
                            Up again, {site.ms} ms
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div
                data-g="token1"
                className="absolute rounded-full bg-ink px-5 py-2.5 text-center text-[15px] font-bold text-butter"
                style={{ left: 578, top: 479, opacity: 0 }}
              >
                Incident opened
              </div>
              <div
                data-g="token2"
                className="absolute rounded-full bg-[#3ddc84] px-5 py-2.5 text-center text-[15px] font-bold text-ink"
                style={{ left: 578, top: 479, opacity: 0 }}
              >
                Resolved
              </div>
            </div>
          </div>
        </div>

        <div className={flat ? "bg-deep px-6 py-24 text-white sm:px-16" : "bg-deep px-6 py-24 text-white sm:px-16 xl:hidden"}>
          <div className="mx-auto max-w-[1312px]">
            <h2 className="font-display text-[clamp(40px,6vw,64px)] font-extrabold leading-none tracking-[-2px]">
              How it works
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              {STEPS.map((step) => (
                <div key={step.title} className="rounded-[28px] bg-white p-7 text-ink">
                  <div className="text-[15px] font-bold text-soft">{step.n}</div>
                  <h3 className="mt-2 font-display text-[32px] font-extrabold tracking-[-1px]">{step.title}</h3>
                  <p className="mt-2 text-[17px] text-soft">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-cream px-6 py-24 sm:px-16">
        <div className="mx-auto max-w-[1312px]">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[clamp(44px,7vw,88px)] font-extrabold leading-[0.95] tracking-[-0.04em]">
                Your monitors, at a glance.
              </h2>
              <p className="mt-4 max-w-[560px] text-[21px] leading-normal text-soft">
                Hover a tile. Then break the API and watch what happens.
              </p>
            </div>
            <button
              type="button"
              aria-pressed={broken}
              onClick={() => setBroken((prev) => !prev)}
              className={`${inkBtn} min-h-14 px-8 text-[17px]`}
            >
              {broken ? "Restore the API" : "Break the API"}
            </button>
          </div>

          <div data-g="tiles" className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {TILES.map((tile) => {
              const isDown = tile.api && broken;

              return (
                <div
                  key={tile.id}
                  data-g="tile"
                  ref={tile.api ? apiTile : undefined}
                  onMouseMove={tileMove}
                  onMouseLeave={tileLeave}
                  className={`rounded-[32px] p-7 shadow-[0_24px_48px_-24px_rgba(16,21,54,0.28)] transition-colors duration-500 ${
                    isDown ? "bg-[#ffd9d0]" : "bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[22px] font-bold">{tile.name}</div>
                      <div className="text-[15px] text-soft">{tile.url}</div>
                    </div>
                    <span
                      className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors duration-500 ${
                        isDown ? "bg-[#c8321a] text-white" : "bg-[#d3f5e2] text-[#0b5a32]"
                      }`}
                    >
                      {isDown ? "Down" : "Up"}
                    </span>
                  </div>
                  <div className="mt-8 font-display text-[58px] font-extrabold leading-none tracking-[-2px]">
                    {isDown ? "No reply" : `${tile.ms} ms`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-[1312px] px-6 sm:px-16">
          <div
            data-g="cta"
            className="flex flex-wrap items-center justify-between gap-10 rounded-[44px] bg-cobalt px-8 py-12 text-white sm:px-16 sm:py-14"
          >
            <div className="max-w-[560px]">
              <h2 className="font-display text-[clamp(38px,5vw,56px)] font-extrabold leading-none tracking-[-2px]">
                Put Sentry on watch.
              </h2>
              <p className="mt-4 text-[19px] leading-normal">
                Add your first site in a minute. Sentry takes it from there.
              </p>
              <Link to="/signup" className={`${butterBtn} mt-7 min-h-[54px] px-8 text-[17px]`}>
                Create your account
              </Link>
            </div>

            <div className="relative h-[200px] w-[200px] shrink-0">
              <SentryAvatar mode="up" size={200} />
              <span className="absolute -top-2 left-[176px] font-display text-[34px] font-extrabold text-butter">z</span>
              <span className="absolute -top-8 left-[198px] font-display text-[24px] font-extrabold text-butter">z</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-ink text-[#c8cbe6]">
        <div className="mx-auto grid max-w-[1312px] items-center gap-6 px-6 py-9 text-white sm:px-16 md:grid-cols-[1fr_auto_1fr]">
          <Link to="/" className="w-fit">
            <Logo />
          </Link>
          <div className="flex items-center gap-8 text-[15px] text-[#c8cbe6]">
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <Link to="/login" className="transition-colors hover:text-white">Log in</Link>
            <Link to="/signup" className="transition-colors hover:text-white">Sign up</Link>
          </div>
          <div className="text-[14px] text-[#c8cbe6] md:text-right">Built by Priyansh</div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
