import express from "express";
import {
  createMonitor,
  getMonitors,
  getMonitor,
  toggleMonitor,
  deleteMonitor,
} from "../controllers/monitor.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const monitorRoutes = express.Router();

monitorRoutes.use(isAuthenticated);

monitorRoutes.post("/", createMonitor);
monitorRoutes.get("/", getMonitors);
monitorRoutes.get("/:id", getMonitor);
monitorRoutes.patch("/:id/toggle", toggleMonitor);
monitorRoutes.delete("/:id", deleteMonitor);

export default monitorRoutes;
