import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import MonitorCard from "../components/MonitorCard";
import { formatDuration } from "../utils/time";

const REFRESH_MS = 30000;

const Dashboard = () => {
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [openIncidents, setOpenIncidents] = useState([]);

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
        setError(error.response?.data?.message || "Could not load monitors.");
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
        prev.map((m) => (m._id === id ? response.data.monitor : m)),
      );
    } catch (error) {
      setActionError(error.response?.data?.message || "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (monitor) => {
    const confirmed = window.confirm(
      `Delete "${monitor.name}"? Its check history and incidents will also be deleted.`,
    );
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
      setActionError(error.response?.data?.message || "Delete failed.");
    } finally {
      setBusyId(null);
    }
  };

  const upCount = monitors.filter((m) => m.isActive && m.status === "up").length;
  const downCount = monitors.filter((m) => m.isActive && m.status === "down").length;
  const pausedCount = monitors.filter((m) => !m.isActive).length;

  return (
    <div className="min-h-screen bg-[#f5f2ed]">
      <Navbar />

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-[#303030]">
              Your monitors
            </h1>
            {!loading && !error && (
              <p className="mt-1 text-[13px] text-[#999999]">
                {monitors.length} total · {upCount} up · {downCount} down ·{" "}
                {pausedCount} paused
              </p>
            )}
          </div>

          <Link
            to="/monitors/new"
            className="rounded-full bg-[#ff9918] px-5 py-3 text-[13px] font-medium text-white transition hover:bg-[#f58c08]"
          >
            + Add monitor
          </Link>
        </div>

        {openIncidents.length > 0 && (
          <div className="mt-6 rounded-3xl bg-red-50 p-5 text-[13px] text-red-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">
                {openIncidents.length === 1
                  ? "1 open incident"
                  : `${openIncidents.length} open incidents`}
              </p>
              <Link
                to="/incidents"
                className="rounded-full bg-red-600 px-4 py-2 font-semibold text-white transition hover:bg-red-700"
              >
                View incidents
              </Link>
            </div>
            <ul className="mt-3 space-y-1">
              {openIncidents.map((incident) => (
                <li key={incident._id}>
                  <span className="font-medium">
                    {incident.monitor?.name || "Deleted monitor"}
                  </span>{" "}
                  down for{" "}
                  {formatDuration(Date.now() - new Date(incident.startedAt).getTime())}
                  {incident.status === "acknowledged" && " · acknowledged"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {actionError && (
          <p className="mt-4 text-[13px] text-red-500">{actionError}</p>
        )}

        {loading && (
          <p className="mt-10 text-center text-[13px] text-[#999999]">
            Loading monitors...
          </p>
        )}

        {error && (
          <div className="mt-10 rounded-3xl bg-white p-10 text-center">
            <p className="text-[14px] text-red-500">{error}</p>
            <button
              onClick={() => fetchMonitors()}
              className="mt-4 rounded-full bg-[#303030] px-5 py-2 text-[13px] font-medium text-white"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && monitors.length === 0 && (
          <div className="mt-10 rounded-3xl border border-dashed border-[#d5d5d5] bg-white p-10 text-center">
            <p className="text-[15px] font-medium text-[#303030]">
              No monitors yet
            </p>
            <p className="mt-1 text-[13px] text-[#999999]">
              Add a website or API to start tracking its uptime.
            </p>
            <Link
              to="/monitors/new"
              className="mt-5 inline-block rounded-full bg-[#ff9918] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#f58c08]"
            >
              Add your first monitor
            </Link>
          </div>
        )}

        {!loading && !error && monitors.length > 0 && (
          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {monitors.map((monitor) => (
              <MonitorCard
                key={monitor._id}
                monitor={monitor}
                onToggle={handleToggle}
                onDelete={handleDelete}
                busy={busyId === monitor._id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;
