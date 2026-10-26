import express from "express";
import {
  getChannels,
  createChannel,
  updateChannel,
  deleteChannel,
  testChannel,
} from "../controllers/webhook.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const webhookRoutes = express.Router();

webhookRoutes.use(isAuthenticated);

webhookRoutes.get("/", getChannels);
webhookRoutes.post("/", createChannel);
webhookRoutes.patch("/:id", updateChannel);
webhookRoutes.delete("/:id", deleteChannel);
webhookRoutes.post("/:id/test", testChannel);

export default webhookRoutes;
