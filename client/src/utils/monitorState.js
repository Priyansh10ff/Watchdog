export const SLOW_MS = 1500;

export const getState = (monitor) => {
  if (!monitor.isActive) return "paused";
  if (monitor.status === "down") return "down";
  if (monitor.status === "up") {
    return monitor.lastResponseTimeMs > SLOW_MS ? "slow" : "up";
  }
  return "waiting";
};

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const rank = { down: 0, slow: 1, waiting: 2, up: 3, paused: 4 };

export const sortMonitors = (monitors) =>
  [...monitors].sort((a, b) => rank[getState(a)] - rank[getState(b)]);

export const summarize = (monitors) => {
  const states = monitors.map(getState);
  const count = (state) => states.filter((s) => s === state).length;
  const down = count("down");
  const slow = count("slow");
  const up = count("up");
  const paused = count("paused");
  const waiting = count("waiting");
  const active = monitors.length - paused;
  const downNames = monitors
    .filter((m, i) => states[i] === "down")
    .map((m) => m.name);

  if (monitors.length === 0) {
    return {
      mode: "up",
      headline: "Nothing to watch yet",
      hint: "Add a website or API and Sentry will start watching it.",
    };
  }

  if (down > 0) {
    return {
      mode: "down",
      headline:
        down === 1 ? `${downNames[0]} is down` : `${down} monitors are down`,
      hint: "Sentry is barking. One incident is tracked per outage.",
    };
  }

  if (slow > 0) {
    return {
      mode: "slow",
      headline: `${plural(slow, "monitor")} ${slow === 1 ? "is" : "are"} slow`,
      hint: "These sites answer, but slower than 1.5 seconds.",
    };
  }

  if (active === 0) {
    return {
      mode: "up",
      headline: "Everything is paused",
      hint: "Resume a monitor to start watching it again.",
    };
  }

  if (waiting === active) {
    return {
      mode: "up",
      headline: "Waiting for the first checks",
      hint: "Results appear after the first check runs.",
    };
  }

  return {
    mode: "up",
    headline:
      waiting === 0
        ? up === 1
          ? "Your monitor is up"
          : `All ${up} monitors are up`
        : `${up} up, ${waiting} waiting`,
    hint: "Sentry is napping. Checks keep running in the background.",
  };
};
