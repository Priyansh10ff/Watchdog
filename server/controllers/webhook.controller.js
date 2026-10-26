import crypto from "crypto";
import mongoose from "mongoose";
import WebhookChannel from "../models/webhookChannel.model.js";
import { sendTest } from "../services/alert.service.js";
import { WEBHOOK_FORMATS, maskUrl, validateWebhookUrl } from "../utils/webhookUrl.js";

const MAX_CHANNELS_PER_USER = 3;
const TEST_COOLDOWN_MS = 10000;

const newSecret = () => crypto.randomBytes(24).toString("hex");

const present = (channel) => ({
  _id: channel._id,
  name: channel.name,
  format: channel.format,
  isActive: channel.isActive,
  urlPreview: maskUrl(channel.url),
  lastDelivery: channel.lastDelivery?.at
    ? {
        at: channel.lastDelivery.at,
        event: channel.lastDelivery.event,
        ok: channel.lastDelivery.ok,
        statusCode: channel.lastDelivery.statusCode ?? null,
        error: channel.lastDelivery.error || "",
      }
    : null,
  createdAt: channel.createdAt,
  updatedAt: channel.updatedAt,
});

const findOwned = async (id, userId) => {
  if (!mongoose.isValidObjectId(id)) return null;
  return WebhookChannel.findOne({ _id: id, user: userId }).select("+url +signingSecret");
};

const readFields = (body, partial) => {
  const data = {};
  const wants = (key) => !partial || body[key] !== undefined;

  if (wants("name")) {
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 40
    ) {
      return { error: "Name must be 1 to 40 characters" };
    }
    data.name = body.name.trim();
  }

  if (wants("format")) {
    if (typeof body.format !== "string" || !WEBHOOK_FORMATS.includes(body.format)) {
      return { error: "Format must be slack, discord or generic" };
    }
    data.format = body.format;
  }

  if (wants("url") && typeof body.url !== "string") {
    return { error: "Webhook URL is required" };
  }

  if (wants("url")) data.url = body.url;

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return { error: "isActive must be true or false" };
    }
    data.isActive = body.isActive;
  }

  return { data };
};

export const getChannels = async (req, res) => {
  try {
    const channels = await WebhookChannel.find({ user: req.user._id })
      .select("+url")
      .sort({ createdAt: 1 });

    return res.status(200).json({
      success: true,
      count: channels.length,
      limit: MAX_CHANNELS_PER_USER,
      channels: channels.map(present),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const createChannel = async (req, res) => {
  try {
    const body = req.body || {};
    const result = readFields(body, false);

    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const urlCheck = validateWebhookUrl(result.data.url, result.data.format);

    if (!urlCheck.valid) {
      return res.status(400).json({ success: false, message: urlCheck.message });
    }

    const count = await WebhookChannel.countDocuments({ user: req.user._id });

    if (count >= MAX_CHANNELS_PER_USER) {
      return res.status(403).json({
        success: false,
        message: `You can have at most ${MAX_CHANNELS_PER_USER} alert channels`,
      });
    }

    const signingSecret = result.data.format === "generic" ? newSecret() : "";

    const channel = await WebhookChannel.create({
      user: req.user._id,
      name: result.data.name,
      format: result.data.format,
      url: urlCheck.url,
      signingSecret,
      isActive: result.data.isActive ?? true,
    });

    return res.status(201).json({
      success: true,
      message: "Alert channel added",
      channel: present(channel),
      ...(signingSecret ? { signingSecret } : {}),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const updateChannel = async (req, res) => {
  try {
    const body = req.body || {};
    const editable = ["name", "format", "url", "isActive"];

    if (!editable.some((key) => body[key] !== undefined)) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const result = readFields(body, true);

    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const channel = await findOwned(req.params.id, req.user._id);

    if (!channel) {
      return res.status(404).json({ success: false, message: "Alert channel not found" });
    }

    const format = result.data.format ?? channel.format;
    const changesAddress = result.data.url !== undefined || result.data.format !== undefined;

    if (changesAddress) {
      const urlCheck = validateWebhookUrl(result.data.url ?? channel.url, format);

      if (!urlCheck.valid) {
        return res.status(400).json({ success: false, message: urlCheck.message });
      }

      if (urlCheck.url !== channel.url) channel.lastDelivery = undefined;
      channel.url = urlCheck.url;
      channel.format = format;
    }

    if (result.data.name !== undefined) channel.name = result.data.name;
    if (result.data.isActive !== undefined) channel.isActive = result.data.isActive;

    let signingSecret = "";

    if (format === "generic" && !channel.signingSecret) {
      signingSecret = newSecret();
      channel.signingSecret = signingSecret;
    }

    await channel.save();

    return res.status(200).json({
      success: true,
      message: "Alert channel updated",
      channel: present(channel),
      ...(signingSecret ? { signingSecret } : {}),
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const deleteChannel = async (req, res) => {
  try {
    const channel = await findOwned(req.params.id, req.user._id);

    if (!channel) {
      return res.status(404).json({ success: false, message: "Alert channel not found" });
    }

    await channel.deleteOne();

    return res.status(200).json({ success: true, message: "Alert channel deleted" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export const testChannel = async (req, res) => {
  try {
    const channel = await findOwned(req.params.id, req.user._id);

    if (!channel) {
      return res.status(404).json({ success: false, message: "Alert channel not found" });
    }

    const last = channel.lastDelivery?.at;

    if (last && Date.now() - new Date(last).getTime() < TEST_COOLDOWN_MS) {
      return res.status(429).json({
        success: false,
        message: "Wait a few seconds before sending another message",
      });
    }

    const outcome = await sendTest(channel);

    return res.status(200).json({
      success: true,
      message: outcome.ok ? "Test message sent" : "The test message could not be delivered",
      delivery: {
        ok: outcome.ok,
        statusCode: outcome.statusCode,
        error: outcome.error,
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
