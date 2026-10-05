const PRIVATE_HOST =
  /^(localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?)$/i;

const validateUrl = (value) => {
  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    return { valid: false, message: "Invalid URL" };
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, message: "URL must start with http:// or https://" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, message: "Do not put credentials in the URL" };
  }

  if (
    process.env.NODE_ENV === "production" &&
    PRIVATE_HOST.test(parsed.hostname)
  ) {
    return { valid: false, message: "Private and local addresses are not allowed" };
  }

  return { valid: true, url: parsed.href };
};

export default validateUrl;
