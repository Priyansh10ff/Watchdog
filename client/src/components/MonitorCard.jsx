import StatusBadge from "./StatusBadge";

const timeAgo = (date) => {
  if (!date) return "Not checked yet";

  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "Just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  return `${Math.floor(hours / 24)} days ago`;
};

const MonitorCard = ({ monitor, onToggle, onDelete, busy }) => {
  const status = monitor.isActive ? monitor.status : "paused";

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-[17px] font-semibold text-[#303030]">
            {monitor.name}
          </h3>
          <a
            href={monitor.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-[13px] text-[#999999] hover:text-[#ff6b35]"
          >
            {monitor.url}
          </a>
        </div>

        <StatusBadge status={status} />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 text-[13px]">
        <div>
          <p className="text-[#aaaaaa]">Interval</p>
          <p className="mt-1 font-medium text-[#303030]">
            Every {monitor.intervalMinutes} min
          </p>
        </div>

        <div>
          <p className="text-[#aaaaaa]">Last check</p>
          <p className="mt-1 font-medium text-[#303030]">
            {timeAgo(monitor.lastCheckedAt)}
          </p>
        </div>

        <div>
          <p className="text-[#aaaaaa]">Response</p>
          <p className="mt-1 font-medium text-[#303030]">
            {monitor.lastResponseTimeMs != null
              ? `${monitor.lastResponseTimeMs} ms`
              : "-"}
          </p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => onToggle(monitor._id)}
          disabled={busy}
          className="rounded-full bg-[#f5f2ed] px-4 py-2 text-[13px] font-semibold text-[#303030] transition hover:bg-[#303030] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {monitor.isActive ? "Pause" : "Resume"}
        </button>

        <button
          onClick={() => onDelete(monitor)}
          disabled={busy}
          className="rounded-full bg-red-50 px-4 py-2 text-[13px] font-semibold text-red-600 transition hover:bg-red-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default MonitorCard;
