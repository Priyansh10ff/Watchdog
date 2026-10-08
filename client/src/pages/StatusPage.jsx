import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axiosInstance from "../services/api";
import Logo from "../components/Logo";
import SentryAvatar from "../components/SentryAvatar";
import StatusBadge from "../components/StatusBadge";
import CheckBars from "../components/CheckBars";
import { butterBtn } from "../components/ui";
import { formatDateTime, formatDuration, timeAgo } from "../utils/time";

const REFRESH_MS = 60000;

const OVERALL = {
  operational: { mode: "up", headline: "All systems operational" },
  degraded: { mode: "slow", headline: "Some systems are slow" },
  outage: { mode: "down", headline: "Some systems are down" },
  paused: { mode: "up", headline: "Monitoring is paused" },
  empty: { mode: "up", headline: "No monitors on this page yet" },
};

const StatusPage = () => {
  const { slug } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const fetchStatus = async (silent = false) => {
    if (!silent) {
      setError("");
      setLoading(true);
    }
    try {
      const response = await axiosInstance.get(`/status/${slug}`);
      setData(response.data);
      setNotFound(false);
      setError("");
    } catch (err) {
      if (err.response?.status === 404) {
        setNotFound(true);
        setData(null);
      } else if (!silent) {
        setError(
          err.response?.data?.message ||
            "Could not reach the server. Check your connection and try again.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(() => fetchStatus(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [slug]);

  useEffect(() => {
    document.title = data ? `${data.page.title} status` : "Status";
  }, [data]);

  const overall = data ? OVERALL[data.overall] || OVERALL.operational : null;

  return (
    <div
      className={`min-h-screen text-white transition-colors duration-500 ${
        data?.overall === "outage" ? "bg-redwall" : "bg-deep"
      }`}
    >
      <div className="mx-auto max-w-[880px] px-6 pb-20 pt-6 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" aria-label="Watchdog home">
            <Logo />
          </Link>
          {data && (
            <span className="text-[14px]">Updated {timeAgo(data.updatedAt)}</span>
          )}
        </header>

        {loading && (
          <div className="mt-12 space-y-5">
            <div className="h-[120px] animate-pulse rounded-[28px] bg-white/10" />
            <div className="h-[170px] animate-pulse rounded-[28px] bg-white/10" />
            <div className="h-[170px] animate-pulse rounded-[28px] bg-white/10" />
          </div>
        )}

        {notFound && (
          <div className="mt-12 rounded-[28px] bg-white p-10 text-ink">
            <h1 className="font-display text-[34px] font-extrabold tracking-[-1px]">
              Status page not found
            </h1>
            <p className="mt-2 max-w-md text-[17px] text-soft">
              This page does not exist, or its owner has not made it public.
            </p>
            <Link to="/" className={`${butterBtn} mt-6`}>
              Go to Watchdog
            </Link>
          </div>
        )}

        {error && (
          <div className="mt-12 rounded-[28px] bg-white p-8 text-ink">
            <p className="text-[16px] font-medium text-[#c8321a]">{error}</p>
            <button
              type="button"
              onClick={() => fetchStatus()}
              className="mt-5 inline-flex min-h-12 items-center rounded-full bg-ink px-7 text-[16px] font-bold text-butter"
            >
              Try again
            </button>
          </div>
        )}

        {data && (
          <>
            <section className="mt-12 flex flex-wrap items-center gap-6">
              <SentryAvatar mode={overall.mode} size={104} />
              <div>
                <p className="text-[16px] font-semibold">{data.page.title}</p>
                <h1 className="font-display text-[clamp(34px,6vw,54px)] font-extrabold leading-none tracking-[-2px]">
                  {overall.headline}
                </h1>
              </div>
            </section>

            <section className="mt-10 space-y-5" aria-label="Monitors">
              {data.monitors.map((monitor) => (
                <div
                  key={monitor.name}
                  className="rounded-[28px] bg-white p-6 text-ink shadow-[0_24px_48px_-24px_rgba(16,21,54,0.35)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-[21px] font-bold">{monitor.name}</h2>
                    <StatusBadge status={monitor.status} />
                  </div>

                  <div className="mt-5">
                    <CheckBars
                      checks={monitor.recentChecks}
                      paused={monitor.status === "paused"}
                      slots={30}
                      height={40}
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-soft">
                    <span>
                      {monitor.uptime24h == null ? "-" : `${monitor.uptime24h}%`}{" "}
                      uptime, 24 h
                    </span>
                    {monitor.responseTimeMs != null && (
                      <span>{monitor.responseTimeMs} ms response</span>
                    )}
                    <span>Checked {timeAgo(monitor.lastCheckedAt)}</span>
                  </div>
                </div>
              ))}
            </section>

            <section className="mt-12" aria-label="Past incidents">
              <h2 className="font-display text-[30px] font-extrabold tracking-[-1px]">
                Past incidents
              </h2>
              <p className="mt-1 text-[15px]">The last 14 days.</p>

              {data.incidents.length === 0 ? (
                <div className="mt-5 rounded-[28px] bg-white p-6 text-[16px] text-soft">
                  No incidents in the last 14 days.
                </div>
              ) : (
                <ul className="mt-5 space-y-4">
                  {data.incidents.map((incident, i) => (
                    <li
                      key={i}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-white p-5 text-ink"
                    >
                      <div>
                        <p className="text-[17px] font-bold">{incident.monitorName}</p>
                        <p className="text-[14px] text-soft">
                          Started {formatDateTime(incident.startedAt)}
                          {incident.status === "resolved" &&
                            incident.durationMs != null &&
                            `, lasted ${formatDuration(incident.durationMs)}`}
                        </p>
                      </div>
                      <StatusBadge status={incident.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <footer className="mt-16 text-[14px]">
          Powered by{" "}
          <Link to="/" className="font-bold underline underline-offset-4">
            Watchdog
          </Link>
        </footer>
      </div>
    </div>
  );
};

export default StatusPage;
