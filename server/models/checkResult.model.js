import mongoose from "mongoose";

const checkResultSchema = new mongoose.Schema({
  monitor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Monitor",
    required: true,
  },
  isUp: {
    type: Boolean,
    required: true,
  },
  statusCode: {
    type: Number,
  },
  responseTimeMs: {
    type: Number,
  },
  errorMessage: {
    type: String,
    default: "",
  },
  checkedAt: {
    type: Date,
    default: Date.now,
  },
});

checkResultSchema.index({ monitor: 1, checkedAt: -1 });
checkResultSchema.index({ checkedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

const CheckResult = mongoose.model("CheckResult", checkResultSchema);
export default CheckResult;