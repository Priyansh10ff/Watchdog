import StatusBadge from "./StatusBadge";
import { formatDateTime, formatDuration } from "../utils/time";

const describeError = (error) => {
  if (!error) return "-";
  if (error.errorMessage && error.statusCode) {
    return `${error.errorMessage} (HTTP ${error.statusCode})`;
  }
  return error.errorMessage || (error.statusCode ? `HTTP ${error.statusCode}` : "-");
};

const IncidentList = ({ incidents, onAcknowledge, busyId }) => {
  return (
    <div className="space-y-4">
      {incidents.map((incident) => {
        const ongoing = incident.status !== "resolved";
        const duration = ongoing
          ? Date.now() - new Date(incident.startedAt).getTime()
          : incident.durationMs;

        return (
          <div key={incident._id} className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="truncate text-[17px] font-semibold text-[#303030]">
                  {incident.monitor?.name || "Deleted monitor"}
                </h3>
                <p className="truncate text-[13px] text-[#999999]">
                  {incident.monitor?.url}
                </p>
              </div>

              <StatusBadge status={incident.status} />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 text-[13px] md:grid-cols-4">
              <div>
                <p className="text-[#aaaaaa]">Started</p>
                <p className="mt-1 font-medium text-[#303030]">
                  {formatDateTime(incident.startedAt)}
                </p>
              </div>

              <div>
                <p className="text-[#aaaaaa]">{ongoing ? "Down for" : "Lasted"}</p>
                <p className="mt-1 font-medium text-[#303030]">
                  {formatDuration(duration)}
                </p>
              </div>

              <div>
                <p className="text-[#aaaaaa]">Failed checks</p>
                <p className="mt-1 font-medium text-[#303030]">
                  {incident.failedChecks}
                </p>
              </div>

              <div>
                <p className="text-[#aaaaaa]">
                  {ongoing ? "Acknowledged" : "Resolved"}
                </p>
                <p className="mt-1 font-medium text-[#303030]">
                  {ongoing
                    ? formatDateTime(incident.acknowledgedAt)
                    : formatDateTime(incident.resolvedAt)}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-[#f5f2ed] px-4 py-3 text-[13px] text-[#303030]">
              <p>
                <span className="text-[#999999]">Cause: </span>
                {describeError(incident.cause)}
              </p>
              {ongoing && (
                <p className="mt-1">
                  <span className="text-[#999999]">Latest error: </span>
                  {describeError(incident.lastError)}
                </p>
              )}
            </div>

            {incident.status === "open" && onAcknowledge && (
              <button
                onClick={() => onAcknowledge(incident._id)}
                disabled={busyId === incident._id}
                className="mt-5 rounded-full bg-[#303030] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                Acknowledge
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default IncidentList;
