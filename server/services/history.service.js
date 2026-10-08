import CheckResult from "../models/checkResult.model.js";

export const getMonitorHistory = async (monitorIds, recentLimit = 24) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [recent, stats] = await Promise.all([
    Promise.all(
      monitorIds.map((id) =>
        CheckResult.find({ monitor: id })
          .sort({ checkedAt: -1 })
          .limit(recentLimit)
          .select("isUp responseTimeMs checkedAt")
          .lean(),
      ),
    ),
    monitorIds.length
      ? CheckResult.aggregate([
          { $match: { monitor: { $in: monitorIds }, checkedAt: { $gte: since } } },
          {
            $group: {
              _id: "$monitor",
              total: { $sum: 1 },
              up: { $sum: { $cond: ["$isUp", 1, 0] } },
            },
          },
        ])
      : [],
  ]);

  const statsById = new Map(stats.map((item) => [String(item._id), item]));
  const history = new Map();

  monitorIds.forEach((id, index) => {
    const summary = statsById.get(String(id));

    history.set(String(id), {
      recentChecks: [...recent[index]].reverse(),
      uptime24h: summary
        ? Math.round((summary.up / summary.total) * 1000) / 10
        : null,
    });
  });

  return history;
};
