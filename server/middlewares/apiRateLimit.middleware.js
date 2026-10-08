import rateLimit from "express-rate-limit";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT) || 600,
  message: {
    success: false,
    message: "Too many requests, slow down and try again later",
  },
});

export default apiLimiter;
