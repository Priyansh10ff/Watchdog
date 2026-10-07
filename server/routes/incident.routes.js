import express from "express";
import {
  getIncidents,
  getIncident,
  acknowledgeIncident,
} from "../controllers/incident.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const incidentRoutes = express.Router();

incidentRoutes.use(isAuthenticated);

incidentRoutes.get("/", getIncidents);
incidentRoutes.get("/:id", getIncident);
incidentRoutes.patch("/:id/acknowledge", acknowledgeIncident);

export default incidentRoutes;
