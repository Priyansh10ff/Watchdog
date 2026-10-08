import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import CheckBars from "./CheckBars";
import Icon from "./Icon";
import { getState } from "../utils/monitorState";
import { timeAgo } from "../utils/time";
import { tileDeleteBtn, tileEditBtn, tileToggleBtn } from "./ui";

const readout = (monitor, state) => {
  if (state === "down") return "No reply";
  if (state === "paused") return "Off";
  if (state === "waiting") return "Waiting";
  if (monitor.lastResponseTimeMs == null) return "No reply";
  return `${monitor.lastResponseTimeMs} ms`;
};

const MonitorTile = ({ monitor, busy, onToggle, onDelete }) => {
  const state = getState(monitor);
  const uptime = monitor.uptime24h;

  return (
    <div
      className={`rounded-[32px] bg-white p-7 text-ink shadow-[0_24px_48px_-24px_rgba(16,21,54,0.35)] ${
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
        <div className="min-w-0 truncate whitespace-nowrap font-display text-[clamp(32px,3.4vw,48px)] font-extrabold leading-none tracking-[-2px]">
          {readout(monitor, state)}
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div className="font-display text-[24px] font-extrabold leading-none tracking-[-0.5px]">
            {uptime == null ? "-" : `${uptime}%`}
          </div>
          <div className="mt-1 text-[13px] text-soft">uptime, 24 h</div>
        </div>
      </div>

      <div className="mt-5">
        <CheckBars
          checks={monitor.recentChecks || []}
          paused={state === "paused"}
        />
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
