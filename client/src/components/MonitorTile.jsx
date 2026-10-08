import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import Icon from "./Icon";
import { getState, SLOW_MS } from "../utils/monitorState";
import { timeAgo } from "../utils/time";
import { tileDeleteBtn, tileEditBtn, tileToggleBtn } from "./ui";

const SLOTS = 24;

const GREEN = "#3ddc84";
const AMBER = "#ffb020";
const RED = "#ff4b3a";
const GREY = "#c9c4b4";

const tileBg = {
  up: "bg-white",
  slow: "bg-[#fff1c4]",
  down: "bg-[#ffd9d0]",
  waiting: "bg-white",
  paused: "bg-[#ece8df]",
};

const readout = (monitor, state) => {
  if (state === "down") return "No reply";
  if (state === "paused") return "Off";
  if (state === "waiting") return "Waiting";
  return `${monitor.lastResponseTimeMs} ms`;
};

const buildBars = (checks, paused) => {
  const recent = checks.slice(-SLOTS);
  const times = recent
    .filter((check) => check.isUp && check.responseTimeMs != null)
    .map((check) => check.responseTimeMs);
  const max = Math.max(...times, 1);

  const bars = recent.map((check) => {
    if (!check.isUp) {
      return { height: 12, color: paused ? GREY : RED };
    }
    const ratio = Math.min((check.responseTimeMs || 0) / max, 1);
    const slow = check.responseTimeMs > SLOW_MS;
    return {
      height: Math.round(16 + ratio * 34),
      color: paused ? GREY : slow ? AMBER : GREEN,
    };
  });

  const empty = Array.from({ length: SLOTS - bars.length }, () => ({
    height: 10,
    color: "rgba(16,21,54,0.1)",
  }));

  return [...empty, ...bars];
};

const MonitorTile = ({ monitor, busy, onToggle, onDelete }) => {
  const state = getState(monitor);
  const checks = monitor.recentChecks || [];
  const bars = buildBars(checks, state === "paused");
  const failed = checks.filter((check) => !check.isUp).length;
  const uptime = monitor.uptime24h;

  return (
    <div
      className={`rounded-[32px] p-7 text-ink shadow-[0_24px_48px_-24px_rgba(16,21,54,0.35)] transition-colors duration-500 ${tileBg[state]} ${
        state === "down" ? "animate-shake3" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[22px] font-bold">{monitor.name}</h3>
          <a
            href={monitor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[15px] text-soft underline-offset-4 hover:underline"
          >
            {monitor.url}
          </a>
        </div>
        <StatusBadge status={state} />
      </div>

      <div className="mt-6 flex items-end justify-between gap-3">
        <div className="font-display text-[48px] font-extrabold leading-none tracking-[-2px]">
          {readout(monitor, state)}
        </div>
        <div className="text-right">
          <div className="font-display text-[24px] font-extrabold leading-none tracking-[-0.5px]">
            {uptime == null ? "-" : `${uptime}%`}
          </div>
          <div className="mt-1 text-[13px] text-soft">uptime, 24 h</div>
        </div>
      </div>

      <div
        role="img"
        aria-label={
          checks.length === 0
            ? "No checks yet"
            : `${failed} of the last ${checks.length} checks failed`
        }
        className="mt-5 flex h-[50px] items-end gap-1"
      >
        {bars.map((bar, i) => (
          <span
            key={i}
            className="flex-1 rounded-[4px]"
            style={{ height: bar.height, background: bar.color }}
          />
        ))}
      </div>

      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-soft">
        <span>Every {monitor.intervalMinutes} min</span>
        <span>Checked {timeAgo(monitor.lastCheckedAt)}</span>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link to={`/monitors/${monitor._id}/edit`} className={tileEditBtn}>
          <Icon name="edit" />
          Edit
        </Link>
        <button
          type="button"
          onClick={() => onToggle(monitor._id)}
          disabled={busy}
          className={tileToggleBtn}
        >
          <Icon name={monitor.isActive ? "pause" : "play"} />
          {monitor.isActive ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(monitor)}
          disabled={busy}
          className={tileDeleteBtn}
        >
          <Icon name="trash" />
          Delete
        </button>
      </div>
    </div>
  );
};

export default MonitorTile;
