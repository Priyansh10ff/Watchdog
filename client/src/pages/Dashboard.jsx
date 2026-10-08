import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import SentryAvatar from "../components/SentryAvatar";
import { useConfirm } from "../components/ConfirmDialog";
import MonitorTile from "../components/MonitorTile";
import { butterBtn, cardClass, inkBtn } from "../components/ui";
import { sortMonitors, summarize } from "../utils/monitorState";
import { formatDuration } from "../utils/time";

const REFRESH_MS = 30000;

const Dashboard = () => {
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [openIncidents, setOpenIncidents] = useState([]);
  const { confirm, dialog } = useConfirm();

  const fetchOpenIncidents = async () => {
    try {
      const response = await axiosInstance.get("/incidents", {
        params: { status: "active", limit: 5 },
      });
      setOpenIncidents(response.data.incidents);
    } catch (error) {
      setOpenIncidents([]);
    }
  };

  const fetchMonitors = async (silent = false) => {
    if (!silent) {
      setError("");
      setLoading(true);
    }
    try {
      const response = await axiosInstance.get("/monitors");
      setMonitors(response.data.monitors);
      setError("");
    } catch (error) {
      if (!silent) {
        setError(
          error.response?.data?.message ||
            "Could not reach the server. Check your connection and try again.",
        );
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitors();
    fetchOpenIncidents();
    const timer = setInterval(() => {
      fetchMonitors(true);
      fetchOpenIncidents();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const handleToggle = async (id) => {
    setActionError("");
    setBusyId(id);
    try {
      const response = await axiosInstance.patch(`/monitors/${id}/toggle`);
      setMonitors((prev) =>
        prev.map((m) => (m._id === id ? { ...m, ...response.data.monitor } : m)),
      );
    } catch (error) {
      setActionError(error.response?.data?.message || "Could not update the monitor.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (monitor) => {
    const confirmed = await confirm({
      title: `Delete ${monitor.name}?`,
      message: "Its check history and incidents will also be deleted. This cannot be undone.",
      confirmLabel: "Delete monitor",
    });
    if (!confirmed) return;

    setActionError("");
    setBusyId(monitor._id);
    try {
      await axiosInstance.delete(`/monitors/${monitor._id}`);
      setMonitors((prev) => prev.filter((m) => m._id !== monitor._id));
      setOpenIncidents((prev) =>
        prev.filter((incident) => incident.monitor?._id !== monitor._id),
      );
    } catch (error) {
      setActionError(error.response?.data?.message || "Could not delete the monitor.");
    } finally {
      setBusyId(null);
    }
  };

  const ready = !loading && !error;
  const summary = summarize(monitors);
  const sorted = sortMonitors(monitors);

  return (
    <div
      className={`min-h-screen text-white transition-colors duration-500 ${
        ready && summary.mode === "down" ? "bg-redwall" : "bg-deep"
      }`}
    >
      <Navbar />

      <main className="mx-auto max-w-[1312px] px-6 pb-24 pt-4 sm:px-16">
        <header className="flex flex-wrap items-center gap-6">
          <SentryAvatar mode={ready ? summary.mode : "up"} size={104} />
          <div>
            <h1 className="font-display text-[clamp(34px,5vw,56px)] font-extrabold leading-none tracking-[-2px]">
              {loading ? "Loading monitors" : error ? "Could not load" : summary.headline}
            </h1>
            {ready && <p className="mt-3 text-[18px]">{summary.hint}</p>}
          </div>
        </header>

        {openIncidents.length > 0 && (
          <div className="mt-8 rounded-[28px] bg-ink p-6 text-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[18px] font-bold">
                {openIncidents.length === 1
                  ? "1 open incident"
                  : `${openIncidents.length} open incidents`}
              </p>
              <Link to="/incidents" className={butterBtn}>
                View incidents
              </Link>
            </div>
            <ul className="mt-3 space-y-1 text-[15px]">
              {openIncidents.map((incident) => (
                <li key={incident._id}>
                  <span className="font-bold">
                    {incident.monitor?.name || "Deleted monitor"}
                  </span>{" "}
                  down for{" "}
                  {formatDuration(Date.now() - new Date(incident.startedAt).getTime())}
                  {incident.status === "acknowledged" && ", acknowledged"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="mt-6 rounded-2xl bg-ink px-4 py-3 text-[14px] font-medium text-butter"
          >
            {actionError}
          </div>
        )}

        {loading && (
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-[300px] animate-pulse rounded-[32px] bg-white/10" />
            ))}
          </div>
        )}

        {error && (
          <div className={`${cardClass} mt-10 p-8`}>
            <p className="text-[16px] font-medium text-[#c8321a]">{error}</p>
            <button onClick={() => fetchMonitors()} className={`${inkBtn} mt-5`}>
              Try again
            </button>
          </div>
        )}

        {ready && monitors.length === 0 && (
          <div className={`${cardClass} mt-10 p-10`}>
            <h2 className="font-display text-[34px] font-extrabold tracking-[-1px]">
              Nothing to watch yet
            </h2>
            <p className="mt-2 max-w-lg text-[17px] text-soft">
              Paste the address of a website or API. Watchdog will request it on a
              schedule and open an incident when it stops responding.
            </p>
            <Link to="/monitors/new" className={`${inkBtn} mt-6`}>
              Add your first monitor
            </Link>
          </div>
        )}

        {ready && monitors.length > 0 && (
          <>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map((monitor) => (
                <MonitorTile
                  key={monitor._id}
                  monitor={monitor}
                  busy={busyId === monitor._id}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>

            <div className="mt-10">
              <Link to="/monitors/new" className={butterBtn}>
                Add monitor
              </Link>
            </div>
          </>
        )}
      </main>

      {dialog}
    </div>
  );
};

export default Dashboard;
