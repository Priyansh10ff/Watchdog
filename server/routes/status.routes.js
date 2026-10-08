import express from "express";
import { getPublicStatus } from "../controllers/status.controller.js";
import publicLimiter from "../middlewares/publicRateLimit.middleware.js";

const statusRoutes = express.Router();

statusRoutes.get("/:slug", publicLimiter, getPublicStatus);

export default statusRoutes;
