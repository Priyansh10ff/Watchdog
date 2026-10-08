import "dotenv/config";
import mongoose from "mongoose";
import { seedShowcase } from "../services/showcase.service.js";

if (!process.env.MONGO_URI) {
  console.error("MONGO_URI is missing. Fill it in server/.env first.");
  process.exit(1);
}

try {
  await mongoose.connect(process.env.MONGO_URI);

  const result = await seedShowcase({
    email: process.env.SHOWCASE_EMAIL,
    slug: process.env.SHOWCASE_SLUG,
    title: process.env.SHOWCASE_TITLE,
    password: process.env.SHOWCASE_PASSWORD,
  });

  const port = process.env.PORT || 5000;

  console.log(
    result.userCreated
      ? `Created the showcase account ${result.email}`
      : `Using the existing account ${result.email}`,
  );
  if (result.userCreated) {
    console.log(
      result.passwordSet
        ? "You can log in to it with the password you set."
        : "Its password is random. Set SHOWCASE_PASSWORD before the first run if you want to log in to it.",
    );
  }
  console.log(`Monitors added: ${result.created}, already there: ${result.reused}`);
  console.log(`Status page "${result.slug}" published with ${result.total} sites`);
  console.log("");
  console.log("The server checks them within a minute, so keep it running.");
  console.log(`Then open http://localhost:${port}/api/status/${result.slug}`);
  console.log("and reload the landing page.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
