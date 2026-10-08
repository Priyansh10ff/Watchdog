import StatusBadge from "./StatusBadge";
import { getState } from "../utils/monitorState";
import { timeAgo } from "../utils/time";
import { smallDangerBtn, smallInkBtn } from "./ui";

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

const MonitorTile = ({ monitor, busy, onToggle, onDelete }) => {
  const state = getState(monitor);

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

      <div className="mt-7 font-display text-[48px] font-extrabold leading-none tracking-[-2px]">
        {readout(monitor, state)}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[14px] text-soft">
        <span>Every {monitor.intervalMinutes} min</span>
        <span>{timeAgo(monitor.lastCheckedAt)}</span>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onToggle(monitor._id)}
          disabled={busy}
          className={smallInkBtn}
        >
          {monitor.isActive ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          onClick={() => onDelete(monitor)}
          disabled={busy}
          className={smallDangerBtn}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default MonitorTile;
