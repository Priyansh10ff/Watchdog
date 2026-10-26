import mongoose from "mongoose";

const webhookChannelSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 40,
    },
    format: {
      type: String,
      enum: ["slack", "discord", "generic"],
      required: true,
    },
    url: {
      type: String,
      required: true,
      maxlength: 500,
      select: false,
    },
    signingSecret: {
      type: String,
      default: "",
      select: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastDelivery: {
      type: new mongoose.Schema(
        {
          at: { type: Date },
          event: { type: String },
          ok: { type: Boolean },
          statusCode: { type: Number, default: null },
          error: { type: String, default: "" },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

const WebhookChannel = mongoose.model("WebhookChannel", webhookChannelSchema);
export default WebhookChannel;
