import express from "express";

const app = express();
const PORT = process.env.PORT || 4000;
const MODES = ["up", "down", "slow"];

let mode = "up";

app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Demo target</title></head>
  <body style="font-family: sans-serif; padding: 40px">
    <h1>Demo target</h1>
    <p>Current mode: <strong>${mode}</strong></p>
    <p>
      <a href="/control/up">Make it up</a> |
      <a href="/control/slow">Make it slow</a> |
      <a href="/control/down">Make it down</a>
    </p>
    <p>Monitor <code>http://localhost:${PORT}/health</code> with Watchdog.</p>
  </body>
</html>`);
});

app.get("/health", async (req, res) => {
  if (mode === "down") {
    return res.status(503).json({ status: "down" });
  }

  if (mode === "slow") {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return res.json({ status: "ok" });
});

app.get("/page", (req, res) => {
  res.send("<h1>Welcome</h1><p>Sign in to continue.</p>");
});

app.get("/redirect", (req, res) => {
  res.redirect(301, "/health");
});

app.get("/hang", () => {});

app.get("/control/:mode", (req, res) => {
  if (!MODES.includes(req.params.mode)) {
    return res.status(400).json({ message: "Mode must be up, down or slow" });
  }

  mode = req.params.mode;
  return res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`Demo target running on http://localhost:${PORT}`);
});
