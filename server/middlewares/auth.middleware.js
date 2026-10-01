import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

// Put this on any route that needs a logged-in user.
// It reads the token from the cookie, checks it, and sets req.user.
const isAuthenticated = async (req, res, next) => {
  try {
    const token = req.cookies.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    // Throws if the signature is wrong or the token has expired
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // "-password" leaves the hash out of the result
    const user = await User.findById(decoded.userId).select("-password");

    // Token can be valid while the account was deleted
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    req.user = user; // later handlers now know who is calling
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
};

export default isAuthenticated;

// VIVA
// Q: Why query the DB if the JWT is already verified?  To reject deleted users and get fresh data.
// Q: Why a cookie and not localStorage?  httpOnly cookies can't be read by JavaScript, so XSS can't steal the token.
