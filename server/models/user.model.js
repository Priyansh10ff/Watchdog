import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true, // removes spaces at both ends
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true, // creates a DB index, so two users can't share an email
      lowercase: true, // A@x.com and a@x.com become the same email
      trim: true,
    },
    // Stores the bcrypt HASH, never the real password.
    // The controller hashes it before saving (same approach as ShopKart).
    password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

const User = mongoose.model("User", userSchema);
export default User;

// VIVA
// Q: Does unique: true validate?  No, it makes an index. A duplicate throws Mongo error code 11000.
// Q: Where is the password hashed? In the auth controller, with bcrypt, before User.create.
