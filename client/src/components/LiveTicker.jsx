import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import CheckBars from "./CheckBars";
import { prefersReducedMotion } from "../utils/sentryPose";
import { timeAgo } from "../utils/time";
import { inkBtn } from "./ui";

gsap.registerPlugin(ScrollTrigger);

const SLUG = import.meta.env.VITE_SHOWCASE_SLUG || "world";
const ICON_URL =
  import.meta.env.VITE_FAVICON_URL ||
  "https://www.google.com/s2/favicons?sz=64&domain={domain}";

const VISIBLE = 5;
const ROW = 88;
const GAP = 16;
const PITCH = ROW + GAP;
const WINDOW = VISIBLE * PITCH - GAP;
const HOLD = 2.5;
const SLIDE = 0.7;
const REFRESH_MS = 60000;

const TILES = [
  ["#ffe45e", "#101536"],
  ["#ff5a3c", "#101536"],
  ["#2b46ff", "#ffffff"],
  ["#3ddc84", "#101536"],
  ["#ffcf86", "#101536"],
  ["#cfc9ff", "#101536"],
];

const DOT = { up: "#3ddc84", slow: "#ffb020", down: "#ff4b3a" };

const iconFor = (domain) => ICON_URL.replace("{domain}", encodeURIComponent(domain));

const subline = (monitor) => {
  const base = monitor.domain;

  if (monitor.status === "down") return base ? `${base} · Not responding` : "Not responding";
  if (monitor.status === "slow") {
    return base ? `${base} · Slow` : `Slow, checked ${timeAgo(monitor.lastCheckedAt)}`;
  }
  if (monitor.status === "up") return base || `Up, checked ${timeAgo(monitor.lastCheckedAt)}`;
  return "Waiting for the first check";
};

const Row = ({ monitor, index, hidden }) => {
  const [tileBg, tileFg] = TILES[index % TILES.length];
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [monitor.domain]);

  return (
    <div
      aria-hidden={hidden || undefined}
      className="flex items-center gap-4 rounded-[26px] bg-white px-4 text-ink shadow-[0_14px_28px_-18px_rgba(16,21,54,0.45)] transition-[transform,box-shadow] duration-200 hover:-translate-y-[3px] hover:shadow-[0_20px_34px_-18px_rgba(16,21,54,0.55)] sm:gap-5 sm:px-6"
      style={{ height: ROW, marginBottom: GAP }}
    >
      {monitor.domain && !broken ? (
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] bg-cream">
          <img
            src={iconFor(monitor.domain)}
            alt=""
            width="32"
            height="32"
            referrerPolicy="no-referrer"
            onError={() => setBroken(true)}
            className="h-8 w-8 object-contain"
          />
        </span>
      ) : (
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[18px] font-display text-[26px] font-extrabold"
          style={{ background: tileBg, color: tileFg }}
        >
          {monitor.name.charAt(0).toUpperCase()}
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[19px] font-bold leading-tight">{monitor.name}</span>
        <span className="flex items-center gap-[7px] text-[14px] text-soft">
          <span
            className="block h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: DOT[monitor.status] || "#c9c4b4" }}
          />
          <span className="truncate">{subline(monitor)}</span>
        </span>
      </span>

      <span className="hidden w-[150px] shrink-0 md:block">
        <CheckBars checks={monitor.recentChecks} slots={28} height={30} />
      </span>

      <span className="w-[92px] shrink-0 text-right">
        <span className="block font-display text-[24px] font-extrabold leading-[1.1] tracking-[-0.5px]">
          {monitor.uptime24h == null ? "-" : `${monitor.uptime24h}%`}
        </span>
        <span className="block text-[13px] text-soft">
          {monitor.responseTimeMs == null ? "No reply" : `${monitor.responseTimeMs} ms`}
        </span>
      </span>
    </div>
  );
};

const LiveTicker = () => {
  const { user } = useAuth();

  const [data, setData] = useState(null);

  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const timeline = useRef(null);
  const trigger = useRef(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const response = await axiosInstance.get(`/status/${SLUG}`);
        if (alive) setData(response.data);
      } catch (error) {
        return;
      }
    };

    load();
    const timer = setInterval(load, REFRESH_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const count = data ? data.monitors.length : 0;
  const enough = count >= VISIBLE;

  useEffect(() => {
    if (!enough) return undefined;

    ScrollTrigger.refresh();

    if (prefersReducedMotion()) return undefined;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1 });

      for (let i = 0; i < count; i++) {
        tl.fromTo(
          trackRef.current,
          { y: -i * PITCH },
          { y: -(i + 1) * PITCH, duration: SLIDE, ease: "power3.inOut", immediateRender: false },
          i * (HOLD + SLIDE) + HOLD,
        );
      }

      timeline.current = tl;

      trigger.current = ScrollTrigger.create({
        trigger: rootRef.current,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => {
          if (self.isActive) tl.play();
          else tl.pause();
        },
      });

      if (!trigger.current.isActive) tl.pause();
    }, rootRef);

    return () => {
      ctx.revert();
      timeline.current = null;
      trigger.current = null;
    };
  }, [enough, count]);

  if (!enough) return null;

  const monitors = data.monitors;
  const down = monitors.filter((m) => m.status === "down").length;
  const slow = monitors.filter((m) => m.status === "slow").length;
  const timed = monitors.filter((m) => m.responseTimeMs != null);
  const average = timed.length
    ? Math.round(timed.reduce((sum, m) => sum + m.responseTimeMs, 0) / timed.length)
    : null;

  const health =
    down > 0
      ? { text: `${down} down right now`, color: DOT.down }
      : slow > 0
        ? { text: `${slow} slow right now`, color: DOT.slow }
        : { text: "All up right now", color: DOT.up };

  const animated = !prefersReducedMotion();
  const rows = animated ? [...monitors, ...monitors.slice(0, VISIBLE)] : monitors;

  const pause = () => timeline.current?.pause();
  const resume = () => {
    if (trigger.current?.isActive) timeline.current?.play();
  };

  const chip =
    "inline-flex h-[38px] items-center gap-[9px] rounded-full bg-ink/10 px-4 text-[14px] font-bold";

  return (
    <section ref={rootRef} className="bg-butter px-6 py-24 text-ink lg:py-28 sm:px-16">
      <div className="mx-auto grid max-w-[1312px] items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-[72px]">
        <div>
          <span className="inline-flex h-[38px] items-center gap-3 rounded-full bg-ink pl-4 pr-[18px] text-[15px] font-bold text-white">
            <span className="relative block h-[10px] w-[10px]">
              <span className="absolute inset-0 animate-ping rounded-full bg-[#3ddc84]" />
              <span className="absolute inset-0 rounded-full bg-[#3ddc84]" />
            </span>
            Live now
          </span>

          <h2 className="mt-6 font-display text-[clamp(40px,5vw,64px)] font-extrabold leading-[0.98] tracking-[-2.5px]">
            The internet, on watch.
          </h2>
          <p className="mt-5 max-w-[440px] text-[20px] leading-normal text-[#2b2f55]">
            These are sites you use every day. Watchdog checks them around the clock, and your own
            sites can get the same public view.
          </p>

          <Link
            to={user ? "/monitors/new" : "/signup"}
            className={`${inkBtn} mt-8 min-h-14 px-8 text-[17px]`}
          >
            {user ? "Add your own site" : "Watch your own sites"}
          </Link>
        </div>

        <div onMouseEnter={pause} onMouseLeave={resume}>
          <div className="mb-5 flex flex-wrap gap-2.5">
            <span className={chip}>{count} sites watched</span>
            <span className={chip}>
              <span className="block h-[9px] w-[9px] rounded-full" style={{ background: health.color }} />
              {health.text}
            </span>
            {average != null && <span className={chip}>Average {average} ms</span>}
          </div>

          <div
            role="region"
            aria-label="Live status of popular websites"
            className="relative overflow-hidden"
            style={{
              height: WINDOW,
              WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%)",
              maskImage: "linear-gradient(to bottom, transparent 0, #000 12%, #000 88%, transparent 100%)",
            }}
          >
            <div ref={trackRef}>
              {rows.map((monitor, i) => (
                <Row
                  key={i}
                  monitor={monitor}
                  index={i % count}
                  hidden={i >= count}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LiveTicker;
