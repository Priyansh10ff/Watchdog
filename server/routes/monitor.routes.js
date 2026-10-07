import express from "express";
import {
  createMonitor,
  getMonitors,
  getMonitor,
  updateMonitor,
  toggleMonitor,
  deleteMonitor,
  getResults,
  checkNow,
} from "../controllers/monitor.controller.js";
import { getMonitorIncidents } from "../controllers/incident.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const monitorRoutes = express.Router();

monitorRoutes.use(isAuthenticated);

monitorRoutes.post("/", createMonitor);
monitorRoutes.get("/", getMonitors);
monitorRoutes.get("/:id", getMonitor);
monitorRoutes.patch("/:id", updateMonitor);
monitorRoutes.patch("/:id/toggle", toggleMonitor);
monitorRoutes.get("/:id/results", getResults);
monitorRoutes.get("/:id/incidents", getMonitorIncidents);
monitorRoutes.post("/:id/check", checkNow);
monitorRoutes.delete("/:id", deleteMonitor);

export default monitorRoutes;
