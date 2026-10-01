import bcrypt from "bcrypt";
import User from "../models/user.model.js";
import genToken from "../utils/generateToken.js";

// Cookie settings.
// httpOnly: JavaScript in the browser cannot read it (protects against XSS).
// secure + sameSite "none": needed in production when the frontend and backend
// are on different domains. In development (plain http://localhost) we use lax.
const isProd = process.env.NODE_ENV === "production";
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, same as the token expiry
};

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Blocks NoSQL injection: someone sending {"email": {"$gt": ""}} instead of a string
    if (
      typeof name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email",
      });
    }

    // bcrypt only reads the first 72 bytes, so very long passwords are pointless
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 72 characters",
      });
    }

    const emailExists = await User.findOne({ email: cleanEmail });

    if (emailExists) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    // 10 = cost factor. Each +1 doubles the hashing time, which slows brute force.
    // bcrypt adds a random salt automatically and stores it inside the hash.
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
    });

    const token = genToken(newUser._id);
    res.cookie("token", token, cookieOptions);

    // Convert to a plain object so we can remove the password before sending
    const newUserObj = newUser.toObject();
    delete newUserObj.password;

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: newUserObj,
    });
  } catch (error) {
    // 11000 = duplicate key. Happens if two requests register the same email at once.
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Email already exists",
      });
    }

    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid input",
      });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });

    // Same message for "no such email" and "wrong password", so an attacker
    // cannot find out which emails are registered (user enumeration).
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // compare (async) does not block the server, unlike compareSync
    const correctPassword = await bcrypt.compare(password, user.password);

    if (!correctPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    const token = genToken(user._id);
    res.cookie("token", token, cookieOptions);

    const userObj = user.toObject();
    delete userObj.password;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user: userObj,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// req.user is set by the isAuthenticated middleware.
// The frontend calls this on page load to find out if the user is still logged in.
export const getUser = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Cookie is httpOnly, so the frontend can't delete it. The server must clear it.
export const logoutUser = async (req, res) => {
  try {
    res.clearCookie("token", cookieOptions);
    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// VIVA
// Q: Why hash instead of encrypt?   Hashing is one-way; a leaked DB doesn't reveal passwords.
// Q: What is a salt?                Random data mixed in so equal passwords get different hashes.
// Q: Why the same login error?      Prevents user enumeration.
// Q: 401 vs 409?                    401 = failed authentication, 409 = conflict (duplicate email).
// Q: Why check typeof?              Stops NoSQL injection through objects in the request body.
