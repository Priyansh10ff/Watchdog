import jwt from "jsonwebtoken";

// Creates a signed token that holds only the user's id.
// The payload is readable by anyone, so never put a password or private data in it.
// expiresIn adds an "exp" time; jwt.verify rejects the token after it passes.
const genToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

export default genToken;

// VIVA
// Q: Does JWT_SECRET change after 7 days?  No. Only tokens expire; the secret is a fixed server key.
// Q: Why can't a user forge a token?        They lack the secret, so they can't make a valid signature.
