import http from "http";

export const startTestServer = async () => {
  const state = { hits: 0, current: 0, maxConcurrent: 0, paths: [] };
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://test.local");
    const path = url.pathname;

    state.hits += 1;
    state.paths.push(path);

    const redirect = (status, to) => {
      res.writeHead(status, { Location: to });
      res.end();
    };

    switch (path) {
      case "/ok":
        res.writeHead(200, { "Content-Type": "text/html" });
        return res.end("<h1>Welcome</h1> Sign in here");
      case "/created":
        res.writeHead(201);
        return res.end("created");
      case "/missing":
        res.writeHead(404);
        return res.end("not found");
      case "/forbidden":
        res.writeHead(403);
        return res.end("forbidden");
      case "/unauthorized":
        res.writeHead(401);
        return res.end("login required");
      case "/error":
        res.writeHead(500);
        return res.end("boom");
      case "/unavailable":
        res.writeHead(503);
        return res.end("down");
      case "/slow":
        return setTimeout(() => {
          res.writeHead(200);
          res.end("slow but fine");
        }, 600);
      case "/delay":
        state.current += 1;
        state.maxConcurrent = Math.max(state.maxConcurrent, state.current);
        return setTimeout(() => {
          state.current -= 1;
          res.writeHead(200);
          res.end("ok");
        }, 40);
      case "/hang":
        return undefined;
      case "/reset":
        return req.socket.destroy();
      case "/redirect":
        return redirect(302, "/ok");
      case "/redirect301":
        return redirect(301, "/ok");
      case "/redirect-missing":
        return redirect(302, "/missing");
      case "/redirect-no-location":
        res.writeHead(302);
        return res.end();
      case "/loop":
        return redirect(302, "/loop");
      case "/hop1":
        return redirect(302, "/hop2");
      case "/hop2":
        return redirect(302, "/hop3");
      case "/hop3":
        return redirect(302, "/ok");
      case "/hop4":
        return redirect(302, "/hop1");
      case "/ua":
        res.writeHead(200);
        return res.end(String(req.headers["user-agent"]));
      case "/big":
        res.writeHead(200);
        return res.end("a".repeat(3 * 1024 * 1024));
      default:
        res.writeHead(404);
        return res.end("unknown");
    }
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address();

  return {
    port,
    base: `http://127.0.0.1:${port}`,
    state,
    reset: () => {
      state.hits = 0;
      state.current = 0;
      state.maxConcurrent = 0;
      state.paths = [];
    },
    close: () =>
      new Promise((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        server.close(resolve);
      }),
  };
};

export const freePort = async () => {
  const server = http.createServer();

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));

  return port;
};

export const startDemoServer = async () => {
  const state = { mode: "up" };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://demo.local");

    if (url.pathname === "/health") {
      if (state.mode === "down") {
        res.writeHead(503, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "down" }));
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "ok" }));
    }

    if (url.pathname.startsWith("/control/")) {
      const mode = url.pathname.split("/")[2];

      if (!["up", "down", "slow"].includes(mode)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ message: "Mode must be up, down or slow" }));
      }

      state.mode = mode;
      res.writeHead(302, { Location: "/" });
      return res.end();
    }

    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(`<h1>Demo target</h1><p>Current mode: <strong>${state.mode}</strong></p>`);
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address();

  return {
    base: `http://127.0.0.1:${port}`,
    state,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
};

export const startReceiver = async () => {
  const requests = [];
  const behavior = { statuses: [], defaultStatus: 204, delayMs: 0 };

  const server = http.createServer((req, res) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
    });

    req.on("end", () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body });

      const status = behavior.statuses.length ? behavior.statuses.shift() : behavior.defaultStatus;

      const respond = () => {
        res.writeHead(status, status >= 300 && status < 400 ? { Location: "/elsewhere" } : {});
        res.end(status === 200 ? "ok" : "");
      };

      if (behavior.delayMs) setTimeout(respond, behavior.delayMs);
      else respond();
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  const { port } = server.address();

  return {
    base: `http://127.0.0.1:${port}`,
    port,
    requests,
    behavior,
    json: (index) => JSON.parse(requests[index].body),
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
};
