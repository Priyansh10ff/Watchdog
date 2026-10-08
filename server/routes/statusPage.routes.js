import express from "express";
import {
  getMyStatusPage,
  saveMyStatusPage,
  deleteMyStatusPage,
} from "../controllers/status.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";

const statusPageRoutes = express.Router();

statusPageRoutes.use(isAuthenticated);

statusPageRoutes.get("/", getMyStatusPage);
statusPageRoutes.put("/", saveMyStatusPage);
statusPageRoutes.delete("/", deleteMyStatusPage);

export default statusPageRoutes;
