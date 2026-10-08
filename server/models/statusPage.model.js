import mongoose from "mongoose";

const statusPageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    monitors: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Monitor",
      },
    ],
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

const StatusPage = mongoose.model("StatusPage", statusPageSchema);
export default StatusPage;
