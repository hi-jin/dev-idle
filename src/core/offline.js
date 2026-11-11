// Offline progress (FR-27, spec 10.3). When a save is loaded, the time away
// (at most 8 hours) is played in 10-second idle ticks, and what happened is
// summed up for the "While you were away" window.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  // Seconds away, from the save time and now (both in ms). A clock that went
  // backwards counts as no time away.
  core.awaySeconds = function (savedAt, now) {
    if (!savedAt || !(now > savedAt)) return 0;
    return Math.min(B.offline.maxSeconds, (now - savedAt) / 1000);
  };

  core.runOffline = function (s, seconds) {
    const O = B.offline;
    const total = Math.max(0, Math.min(O.maxSeconds, seconds || 0));
    const before = { money: s.money, revenue: s.runRevenue, stage: s.stage, tasks: s.stats.tasksDone };
    const sum = { seconds: total, outages: 0, failed: 0, achievements: [], stages: [] };
    const notes = [];
    if (s.caffeine.fever) core.endFever(s, notes);
    let left = total;
    while (left > 1e-9) {
      const dt = Math.min(O.tickSeconds, left);
      for (const n of core.tick(s, dt, { idle: true })) {
        if (n.type === 'outage') sum.outages += 1;
        else if (n.type === 'taskFailed') sum.failed += 1;
        else if (n.type === 'achievement') sum.achievements.push(n.id);
        else if (n.type === 'stage') sum.stages.push(n.stage);
      }
      left -= dt;
    }
    sum.earned = s.runRevenue - before.revenue;
    sum.money = s.money - before.money;
    sum.tasks = s.stats.tasksDone - before.tasks;
    sum.stageFrom = before.stage;
    sum.stageTo = s.stage;
    sum.ready = s.apps.filter((a) => core.isReleaseReady(a)).map((a) => a.id);
    return sum;
  };
})(window.Game = window.Game || {});
