import { useEffect, useState } from "react";
import axiosInstance from "../services/api";
import Navbar from "../components/Navbar";
import Icon from "../components/Icon";
import ChipGroup from "../components/ChipGroup";
import FormField from "../components/FormField";
import { useConfirm } from "../components/ConfirmDialog";
import {
  cardClass,
  inkBtn,
  inputClass,
  smallInkBtn,
  tileDeleteBtn,
  tileToggleBtn,
} from "../components/ui";
import {
  CHANNEL_FORMATS,
  NAME_MAX,
  describeDelivery,
  formatLabel,
  urlHint,
  urlPlaceholder,
  validateChannelForm,
} from "../utils/webhookForm";

const DOT = {
  ok: "bg-[#2ea44f]",
  fail: "bg-[#c8321a]",
  none: "bg-ink/25",
};

const emptyForm = { name: "", format: "slack", url: "" };

const Alerts = () => {
  const [channels, setChannels] = useState([]);
  const [limit, setLimit] = useState(3);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [results, setResults] = useState({});
  const [secret, setSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const { confirm, dialog } = useConfirm();

  const load = async (quiet = false) => {
    if (!quiet) {
      setLoadError("");
      setLoading(true);
    }

    try {
      const response = await axiosInstance.get("/webhooks");
      setChannels(response.data.channels);
      setLimit(response.data.limit);
    } catch (error) {
      if (!quiet) {
        setLoadError(
          error.response?.data?.message ||
            "Could not reach the server. Check your connection and try again.",
        );
      }
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const change = (name, value) => {
    setErr("");
    setNotice("");
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    setNotice("");

    const problem = validateChannelForm(form);

    if (problem) {
      setErr(problem);
      return;
    }

    setSaving(true);

    try {
      const response = await axiosInstance.post("/webhooks", {
        name: form.name.trim(),
        format: form.format,
        url: form.url.trim(),
      });

      setChannels((prev) => [...prev, response.data.channel]);
      setForm({ ...emptyForm, format: form.format });
      setNotice("Channel added. Press Send test to check that it works.");
      setSecret(
        response.data.signingSecret
          ? { name: response.data.channel.name, value: response.data.signingSecret }
          : null,
      );
      setCopied(false);
    } catch (error) {
      setErr(
        error.response?.data?.message ||
          "Could not reach the server. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (channel) => {
    setErr("");
    setNotice("");
    setResults((prev) => ({ ...prev, [channel._id]: null }));
    setTesting((prev) => ({ ...prev, [channel._id]: true }));

    try {
      const response = await axiosInstance.post(`/webhooks/${channel._id}/test`);
      const delivery = response.data.delivery;

      setResults((prev) => ({
        ...prev,
        [channel._id]: {
          ok: delivery.ok,
          text: delivery.ok
            ? "Test message sent."
            : `The test message could not be delivered: ${delivery.error || `HTTP ${delivery.statusCode}`}`,
        },
      }));
      await load(true);
    } catch (error) {
      setResults((prev) => ({
        ...prev,
        [channel._id]: {
          ok: false,
          text:
            error.response?.data?.message ||
            "Could not reach the server. Check your connection and try again.",
        },
      }));
    } finally {
      setTesting((prev) => ({ ...prev, [channel._id]: false }));
    }
  };

  const handleToggle = async (channel) => {
    setErr("");
    setNotice("");

    try {
      const response = await axiosInstance.patch(`/webhooks/${channel._id}`, {
        isActive: !channel.isActive,
      });

      setChannels((prev) =>
        prev.map((item) => (item._id === channel._id ? response.data.channel : item)),
      );
    } catch (error) {
      setErr(error.response?.data?.message || "Could not update the channel.");
    }
  };

  const handleDelete = async (channel) => {
    const confirmed = await confirm({
      title: `Delete ${channel.name}?`,
      message: "Watchdog will stop sending messages there. You can add the channel again later.",
      confirmLabel: "Delete channel",
    });

    if (!confirmed) return;

    setErr("");
    setNotice("");

    try {
      await axiosInstance.delete(`/webhooks/${channel._id}`);
      setChannels((prev) => prev.filter((item) => item._id !== channel._id));
      setNotice("Channel deleted.");
    } catch (error) {
      setErr(error.response?.data?.message || "Could not delete the channel.");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      setErr("Could not copy. Select the secret and copy it by hand.");
    }
  };

  const full = channels.length >= limit;

  return (
    <div className="min-h-screen bg-deep text-white">
      <Navbar />

      <main className="mx-auto max-w-[860px] px-6 pb-24 pt-4 sm:px-16">
        <h1 className="mt-6 font-display text-[clamp(40px,6vw,64px)] font-extrabold leading-none tracking-[-2px]">
          Alerts
        </h1>
        <p className="mt-3 max-w-xl text-[18px]">
          Get a message in Slack, Discord or any service when a site goes down, and
          again when it recovers. One message per outage, never one per failed check.
        </p>

        {loading && (
          <div className="mt-10 h-[320px] animate-pulse rounded-[28px] bg-white/10" />
        )}

        {loadError && (
          <div className={`${cardClass} mt-10 p-8`}>
            <p className="text-[16px] font-medium text-[#c8321a]">{loadError}</p>
            <button onClick={() => load()} className={`${inkBtn} mt-5`}>
              Try again
            </button>
          </div>
        )}

        {!loading && !loadError && (
          <>
            {err && (
              <div
                role="alert"
                className="mt-8 rounded-2xl bg-[#c8321a] px-4 py-3 text-[14px] font-medium text-white"
              >
                {err}
              </div>
            )}

            {notice && (
              <div
                role="status"
                className="mt-8 rounded-2xl bg-[#d3f5e2] px-4 py-3 text-[14px] font-semibold text-[#0b5a32]"
              >
                {notice}
              </div>
            )}

            {secret && (
              <div className="mt-8 rounded-[28px] bg-ink p-6">
                <p className="text-[15px] font-semibold text-butter">
                  Signing secret for {secret.name}
                </p>
                <p className="mt-1 text-[15px]">
                  Copy it now. It is shown only once. Watchdog signs each message with it in
                  the X-Watchdog-Signature header so your server can check who sent it.
                </p>
                <p className="mt-3 break-all rounded-2xl bg-white/10 px-4 py-3 font-mono text-[14px]">
                  {secret.value}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex min-h-11 items-center rounded-full bg-butter px-5 text-[15px] font-bold text-ink"
                  >
                    {copied ? "Copied" : "Copy secret"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSecret(null)}
                    className="inline-flex min-h-11 items-center rounded-full border-2 border-white/80 px-5 text-[15px] font-bold hover:bg-white hover:text-ink"
                  >
                    I have saved it
                  </button>
                </div>
              </div>
            )}

            {channels.length > 0 && (
              <ul className="mt-8 space-y-5">
                {channels.map((channel) => {
                  const delivery = describeDelivery(channel.lastDelivery);
                  const result = results[channel._id];

                  return (
                    <li key={channel._id} className={`${cardClass} p-6`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate font-display text-[24px] font-extrabold tracking-[-0.5px]">
                            {channel.name}
                          </h2>
                          <p className="mt-1 break-all font-mono text-[13px] text-soft">
                            {channel.urlPreview}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-cream px-3 py-1 text-[13px] font-bold">
                            {formatLabel(channel.format)}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-[13px] font-bold ${
                              channel.isActive
                                ? "bg-[#d3f5e2] text-[#0b5a32]"
                                : "bg-[#e6e3d8] text-[#5b5b52]"
                            }`}
                          >
                            {channel.isActive ? "Active" : "Paused"}
                          </span>
                        </div>
                      </div>

                      <p className="mt-4 flex items-start gap-2 text-[14px] text-soft">
                        <span
                          className={`mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full ${DOT[delivery.tone]}`}
                        />
                        <span>{delivery.text}</span>
                      </p>

                      <div aria-live="polite">
                        {result && (
                          <p
                            className={`mt-3 rounded-2xl px-4 py-3 text-[14px] font-semibold ${
                              result.ok
                                ? "bg-[#d3f5e2] text-[#0b5a32]"
                                : "bg-[#fde3de] text-[#9c2410]"
                            }`}
                          >
                            {result.text}
                          </p>
                        )}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => handleTest(channel)}
                          disabled={testing[channel._id]}
                          className={smallInkBtn}
                        >
                          {testing[channel._id] ? "Sending..." : "Send test"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(channel)}
                          className={tileToggleBtn}
                        >
                          <Icon name={channel.isActive ? "pause" : "play"} />
                          {channel.isActive ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(channel)}
                          className={tileDeleteBtn}
                        >
                          <Icon name="trash" />
                          Delete
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {full ? (
              <div className={`${cardClass} mt-8 p-7`}>
                <h2 className="font-display text-[24px] font-extrabold tracking-[-0.5px]">
                  All {limit} channels are in use
                </h2>
                <p className="mt-1 text-[15px] text-soft">
                  Delete a channel to add another one.
                </p>
              </div>
            ) : (
              <div className={`${cardClass} mt-8`}>
                <form onSubmit={handleSubmit} noValidate>
                  <section className="space-y-5 p-7">
                    <div>
                      <h2 className="font-display text-[24px] font-extrabold tracking-[-0.5px]">
                        {channels.length === 0 ? "Add your first channel" : "Add a channel"}
                      </h2>
                      <p className="text-[14px] text-soft">
                        {channels.length} of {limit} channels used.
                      </p>
                    </div>

                    <FormField label="Name" htmlFor="channel-name">
                      <input
                        id="channel-name"
                        type="text"
                        value={form.name}
                        onChange={(e) => change("name", e.target.value)}
                        maxLength={NAME_MAX}
                        placeholder="Team chat"
                        className={inputClass}
                      />
                    </FormField>

                    <FormField label="Send messages to">
                      <ChipGroup
                        name="format"
                        options={CHANNEL_FORMATS}
                        value={form.format}
                        onChange={change}
                      />
                    </FormField>

                    <FormField
                      label="Webhook URL"
                      htmlFor="channel-url"
                      hint={urlHint(form.format)}
                    >
                      <input
                        id="channel-url"
                        type="text"
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        value={form.url}
                        onChange={(e) => change("url", e.target.value)}
                        placeholder={urlPlaceholder(form.format)}
                        className={inputClass}
                      />
                    </FormField>
                  </section>

                  <div className="border-t border-ink/15 p-7">
                    <button type="submit" disabled={saving} className={inkBtn}>
                      {saving ? "Adding..." : "Add channel"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <p className="mt-8 max-w-xl text-[14px] text-white/80">
              Messages say which monitor is affected, the site's host name, the cause and,
              after a recovery, how long it lasted. They never contain the full address
              of your site. The webhook address is kept private and shown only in part.
            </p>
          </>
        )}
      </main>

      {dialog}
    </div>
  );
};

export default Alerts;
