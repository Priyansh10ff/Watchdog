import mongoose from "mongoose";

const incidentSchema = new mongoose.Schema(
  {
    monitor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Monitor",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["open", "acknowledged", "resolved"],
      default: "open",
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    acknowledgedAt: {
      type: Date,
    },
    resolvedAt: {
      type: Date,
    },
    durationMs: {
      type: Number,
    },
    cause: {
      statusCode: { type: Number, default: null },
      errorMessage: { type: String, default: "" },
    },
    lastError: {
      statusCode: { type: Number, default: null },
      errorMessage: { type: String, default: "" },
      at: { type: Date },
    },
    failedChecks: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

incidentSchema.index(
  { monitor: 1 },
  { unique: true, partialFilterExpression: { isResolved: false } },
);
incidentSchema.index({ user: 1, startedAt: -1 });
incidentSchema.index({ user: 1, status: 1, startedAt: -1 });
incidentSchema.index({ monitor: 1, startedAt: -1 });

const Incident = mongoose.model("Incident", incidentSchema);
export default Incident;
