import cron from "node-cron";
import { claimDueMonitors, processMonitor } from "../services/checker.service.js";

const BATCH_SIZE = 10;
const MAX_PER_RUN = 200;

let running = false;

export const runDueChecks = async () => {
  if (running) return;
  running = true;

  try {
    const monitors = await claimDueMonitors(MAX_PER_RUN);

    for (let i = 0; i < monitors.length; i += BATCH_SIZE) {
      const batch = monitors.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (monitor) => {
          try {
            await processMonitor(monitor);
          } catch (error) {
            console.log(`Check failed for ${monitor._id}:`, error.message);
          }
        }),
      );
    }
  } catch (error) {
    console.log("Scheduler error:", error.message);
  } finally {
    running = false;
  }
};

export const startScheduler = () => {
  cron.schedule("* * * * *", runDueChecks);
  runDueChecks();
  console.log("Scheduler started");
};
