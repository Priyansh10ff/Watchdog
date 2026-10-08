import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import authRoutes from "./routes/auth.routes.js";
import monitorRoutes from "./routes/monitor.routes.js";
import incidentRoutes from "./routes/incident.routes.js";
import statusRoutes from "./routes/status.routes.js";
import statusPageRoutes from "./routes/statusPage.routes.js";
import apiLimiter from "./middlewares/apiRateLimit.middleware.js";

const app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

if (process.env.NODE_ENV !== "test") {
  app.use(
    morgan(process.env.NODE_ENV === "production" ? "combined" : "dev", {
      skip: (req) => req.path === "/api/health",
    }),
  );
}

app.use(helmet());

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

app.use("/api", apiLimiter);

app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/monitors", monitorRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/status", statusRoutes);
app.use("/api/status-page", statusPageRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      success: false,
      message: "Invalid JSON",
    });
  }

  if (err.type === "entity.too.large") {
    return res.status(413).json({
      success: false,
      message: "Request body is too large",
    });
  }

  const status = err.status || err.statusCode;

  if (status >= 400 && status < 500) {
    return res.status(status).json({
      success: false,
      message: "Bad request",
    });
  }

  console.log(err);
  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
  });
});

export default app;
