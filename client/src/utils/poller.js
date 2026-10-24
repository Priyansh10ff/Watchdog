const RETRY_MS = [3000, 6000, 12000, 20000, 30000];

export const pollDelay = (failures, refreshMs) => {
  if (!Number.isInteger(failures) || failures <= 0) return refreshMs;
  if (failures <= RETRY_MS.length) return RETRY_MS[failures - 1];
  return refreshMs;
};

export const startPolling = (task, refreshMs) => {
  let stopped = false;
  let timer = null;
  let failures = 0;

  const run = async () => {
    let ok = false;

    try {
      ok = (await task()) !== false;
    } catch (error) {
      ok = false;
    }

    failures = ok ? 0 : failures + 1;

    if (!stopped) timer = setTimeout(run, pollDelay(failures, refreshMs));
  };

  run();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
};
