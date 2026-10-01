import express from "express";
import {
  registerUser,
  loginUser,
  getUser,
  logoutUser,
} from "../controllers/auth.controller.js";
import isAuthenticated from "../middlewares/auth.middleware.js";
import authLimiter from "../middlewares/rateLimit.middleware.js";

const authRoutes = express.Router();

// Middleware runs left to right: limiter first, then the controller
authRoutes.post("/register", authLimiter, registerUser);
authRoutes.post("/login", authLimiter, loginUser);
authRoutes.get("/me", isAuthenticated, getUser);
authRoutes.post("/logout", logoutUser);

export default authRoutes;
