import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import axiosInstance from "../services/api";
import { useAuth } from "../context/AuthContext";
import Navbar from "../components/Navbar";
import FormField from "../components/FormField";
import { cardClass, inkBtn, inputClass, smallDangerBtn } from "../components/ui";

const MAX_MONITORS = 20;

const slugify = (text) => {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");

  return slug.length >= 3 ? slug : "status";
};

const cleanSlug = (value) =>
  value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);

const StatusPageSettings = () => {
  const { user } = useAuth();

  const [monitors, setMonitors] = useState([]);
  const [page, setPage] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin = window.location.origin;

  const toForm = (saved) =>
    saved
      ? {
          slug: saved.slug,
          title: saved.title,
          monitors: saved.monitors,
          isPublished: saved.isPublished,
        }
      : {
          slug: slugify(user?.name),
          title: "Service status",
          monitors: [],
          isPublished: true,
        };

  const load = async () => {
    setLoadError("");
    setLoading(true);
    try {
      const [pageResponse, monitorResponse] = await Promise.all([
        axiosInstance.get("/status-page"),
        axiosInstance.get("/monitors"),
      ]);
      setPage(pageResponse.data.page);
      setMonitors(monitorResponse.data.monitors);
      setForm(toForm(pageResponse.data.page));
    } catch (error) {
      setLoadError(
        error.response?.data?.message ||
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const change = (patch) => {
    setErr("");
    setNotice("");
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const toggleMonitor = (id) => {
    const selected = form.monitors.includes(id);
    change({
      monitors: selected
        ? form.monitors.filter((item) => item !== id)
        : [...form.monitors, id],
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setNotice("");
    setSaving(true);
    try {
      const response = await axiosInstance.put("/status-page", form);

      setPage(response.data.page);
      setForm(toForm(response.data.page));
      setNotice(
        response.data.page.isPublished
          ? "Saved. Your status page is live."
          : "Saved. The page is hidden from visitors.",
      );
    } catch (error) {
      setErr(
        error.response?.data?.message ||
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Delete your status page? The public link will stop working.",
    );
    if (!confirmed) return;

    setErr("");
    setNotice("");
    try {
      await axiosInstance.delete("/status-page");

      setPage(null);
      setForm(toForm(null));
      setNotice("Status page deleted.");
    } catch (error) {
      setErr(error.response?.data?.message || "Could not delete the page.");
    }
  };

  const publicUrl = page ? `${origin}/status/${page.slug}` : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setErr("Could not copy. Select the link and copy it by hand.");
    }
  };

  return (
    <div className="min-h-screen bg-deep text-white">
      <Navbar />

      <main className="mx-auto max-w-[860px] px-6 pb-24 pt-4 sm:px-16">
        <h1 className="mt-6 font-display text-[clamp(40px,6vw,64px)] font-extrabold leading-none tracking-[-2px]">
          Status page
        </h1>
        <p className="mt-3 max-w-xl text-[18px]">
          Share the live status of chosen monitors with anyone. Visitors see names,
          status and response times, never your URLs.
        </p>

        {loading && (
          <div className="mt-10 h-[420px] animate-pulse rounded-[28px] bg-white/10" />
        )}

        {loadError && (
          <div className={`${cardClass} mt-10 p-8`}>
            <p className="text-[16px] font-medium text-[#c8321a]">{loadError}</p>
            <button onClick={load} className={`${inkBtn} mt-5`}>
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && monitors.length === 0 && (
          <div className={`${cardClass} mt-10 p-10`}>
            <h2 className="font-display text-[30px] font-extrabold tracking-[-1px]">
              Add a monitor first
            </h2>
            <p className="mt-2 max-w-lg text-[17px] text-soft">
              A status page shows the monitors you choose. You have none yet.
            </p>
            <Link to="/monitors/new" className={`${inkBtn} mt-6`}>
              Add a monitor
            </Link>
          </div>
        )}

        {!loading && !loadError && monitors.length > 0 && form && (
          <>
            {page && (
              <div className="mt-10 rounded-[28px] bg-ink p-6">
                {page.isPublished ? (
                  <>
                    <p className="text-[15px] font-semibold text-butter">Your page is live</p>
                    <p className="mt-1 break-all text-[17px]">{publicUrl}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleCopy}
                        className="inline-flex min-h-11 items-center rounded-full bg-butter px-5 text-[15px] font-bold text-ink"
                      >
                        {copied ? "Copied" : "Copy link"}
                      </button>
                      <a
                        href={publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center rounded-full border-2 border-white/80 px-5 text-[15px] font-bold hover:bg-white hover:text-ink"
                      >
                        Open page
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-[16px]">
                    Your page is hidden. Visitors who open the link see "not found".
                  </p>
                )}
              </div>
            )}

            <div className={`${cardClass} mt-8`}>
              <form onSubmit={handleSubmit}>
                {err && (
                  <div
                    role="alert"
                    className="m-6 mb-0 rounded-2xl bg-[#c8321a] px-4 py-3 text-[14px] font-medium text-white"
                  >
                    {err}
                  </div>
                )}
                {notice && (
                  <div
                    role="status"
                    className="m-6 mb-0 rounded-2xl bg-[#d3f5e2] px-4 py-3 text-[14px] font-semibold text-[#0b5a32]"
                  >
                    {notice}
                  </div>
                )}

                <section className="space-y-5 p-7">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-display text-[24px] font-extrabold tracking-[-0.5px]">
                        Visible to everyone
                      </h2>
                      <p className="text-[14px] text-soft">
                        Turn off to hide the page without deleting it.
                      </p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.isPublished}
                      aria-label="Visible to everyone"
                      onClick={() => change({ isPublished: !form.isPublished })}
                      className={`relative h-[30px] w-[52px] shrink-0 rounded-full transition-colors ${
                        form.isPublished ? "bg-ink" : "bg-[#d3d1e0]"
                      }`}
                    >
                      <span
                        className={`absolute top-[3px] h-6 w-6 rounded-full bg-white transition-all ${
                          form.isPublished ? "left-[25px]" : "left-[3px]"
                        }`}
                      />
                    </button>
                  </div>

                  <FormField label="Page title" htmlFor="title">
                    <input
                      id="title"
                      type="text"
                      value={form.title}
                      onChange={(e) => change({ title: e.target.value })}
                      maxLength={60}
                      required
                      className={inputClass}
                    />
                  </FormField>

                  <FormField
                    label="Link"
                    htmlFor="slug"
                    hint="3 to 40 characters: lowercase letters, numbers and hyphens."
                  >
                    <div className="flex items-center overflow-hidden rounded-2xl border-2 border-ink/15 focus-within:border-cobalt">
                      <span className="hidden shrink-0 bg-[#f3f1ec] px-4 text-[14px] text-soft sm:block">
                        {origin}/status/
                      </span>
                      <input
                        id="slug"
                        type="text"
                        value={form.slug}
                        onChange={(e) => change({ slug: cleanSlug(e.target.value) })}
                        maxLength={40}
                        required
                        className="h-12 w-full min-w-0 bg-white px-4 text-[15px] text-ink"
                      />
                    </div>
                  </FormField>
                </section>

                <section className="border-t border-ink/15 p-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="font-display text-[24px] font-extrabold tracking-[-0.5px]">
                        Monitors on the page
                      </h2>
                      <p className="text-[14px] text-soft">
                        {form.monitors.length} of {Math.min(monitors.length, MAX_MONITORS)} selected
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          change({ monitors: monitors.slice(0, MAX_MONITORS).map((m) => m._id) })
                        }
                        className="min-h-10 rounded-full border-2 border-ink/20 px-4 text-[14px] font-bold hover:border-ink"
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        onClick={() => change({ monitors: [] })}
                        className="min-h-10 rounded-full border-2 border-ink/20 px-4 text-[14px] font-bold hover:border-ink"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <ul className="mt-5 space-y-3">
                    {monitors.map((monitor) => {
                      const checked = form.monitors.includes(monitor._id);

                      return (
                        <li key={monitor._id}>
                          <label
                            className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 px-4 py-3 transition-colors ${
                              checked ? "border-ink bg-cream" : "border-ink/15 hover:border-ink/40"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMonitor(monitor._id)}
                              className="h-5 w-5 shrink-0 accent-[#101536]"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[16px] font-bold">
                                {monitor.name}
                              </span>
                              <span className="block truncate text-[13px] text-soft">
                                {monitor.url}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>

                <div className="flex flex-wrap items-center gap-4 border-t border-ink/15 p-7">
                  <button type="submit" disabled={saving} className={inkBtn}>
                    {saving ? "Saving..." : page ? "Save changes" : "Publish status page"}
                  </button>
                  {page && (
                    <button type="button" onClick={handleDelete} className={smallDangerBtn}>
                      Delete page
                    </button>
                  )}
                </div>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default StatusPageSettings;
