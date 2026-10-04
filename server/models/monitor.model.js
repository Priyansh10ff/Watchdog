import mongoose from "mongoose";

const monitorSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    method: {
      type: String,
      enum: ["GET", "HEAD"],
      default: "GET",
    },
    intervalMinutes: {
      type: Number,
      default: 1,
      min: 1,
      max: 60,
    },
    timeoutMs: {
      type: Number,
      default: 10000,
      min: 1000,
      max: 30000,
    },
    expectedStatusCodes: {
      type: [Number],
      default: [200],
    },
    keyword: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    failureThreshold: {
      type: Number,
      default: 3,
      min: 1,
      max: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    encryptedHeaders: {
      type: String,
      default: "",
      select: false,
    },
    status: {
      type: String,
      enum: ["unknown", "up", "down"],
      default: "unknown",
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
    lastCheckedAt: {
      type: Date,
    },
    lastResponseTimeMs: {
      type: Number,
    },
    nextCheckAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

monitorSchema.index({ user: 1, createdAt: -1 });
monitorSchema.index({ isActive: 1, nextCheckAt: 1 });
monitorSchema.index({ user: 1, url: 1 }, { unique: true });

const Monitor = mongoose.model("Monitor", monitorSchema);
export default Monitor;