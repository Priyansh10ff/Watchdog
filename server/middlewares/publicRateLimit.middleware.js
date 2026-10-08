import rateLimit from "express-rate-limit";

const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: {
    success: false,
    message: "Too many requests, try again in a minute",
  },
});

export default publicLimiter;
