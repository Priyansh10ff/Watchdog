// "dotenv/config" loads .env the moment it is imported.
// It must be the FIRST import: ES module imports run before any other code,
// so calling dotenv.config() later would be too late for files that read process.env.
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth.routes.js";

// Fail fast: stop at startup with a clear message instead of failing at the first login
const required = ["MONGO_URI", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Behind a proxy (Render, Railway) the real client IP is in X-Forwarded-For.
// Without this, the rate limiter would see every user as the same IP.
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet()); // sets secure HTTP headers
app.use(express.json({ limit: "10kb" })); // parses JSON bodies, rejects huge ones
app.use(cookieParser()); // fills req.cookies so we can read the token cookie

// credentials: true lets the browser send and receive the cookie across origins.
// origin must be a specific URL (not "*") when credentials are used.
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  }),
);

app.use("/api/auth", authRoutes);

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running" });
});

// Runs only when no route above matched
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Connect to the database first, then start accepting requests
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("DB Connected");
    app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log(err);
    process.exit(1); // a server without its database is useless
  });

// VIVA
// Q: Why is dotenv imported first?  ES imports run before other code.
// Q: Why not cors origin "*"?       Browsers refuse "*" together with cookies.
// Q: Why connect before listen?     So no request arrives before the DB is ready.
