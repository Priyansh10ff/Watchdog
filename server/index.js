import "dotenv/config";
import mongoose from "mongoose";
import app from "./app.js";
import { startScheduler, stopScheduler } from "./jobs/scheduler.js";

const required = ["MONGO_URI", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

const start = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("DB Connected");

    const server = app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });

    if (process.env.DISABLE_SCHEDULER !== "true") {
      startScheduler();
    }

    let closing = false;

    const shutdown = (signal) => {
      if (closing) return;
      closing = true;

      console.log(`${signal} received, shutting down`);
      stopScheduler();

      setTimeout(() => process.exit(1), 10000).unref();

      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

start();
