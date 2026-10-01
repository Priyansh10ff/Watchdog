import rateLimit from "express-rate-limit";

// Allows 10 requests per 15 minutes per IP on the routes it is attached to.
// Slows down password guessing on login and mass account creation on register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many attempts, try again in 15 minutes",
  },
});

export default authLimiter;
