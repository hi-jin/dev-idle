// The bug gauge and outages (FR-14). Bugs come from Accept All failures and
// from hallucinated bugs the player missed. A full gauge starts an outage:
// no revenue and no agent work until the player types the fire out, or it
// burns out on its own.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  // Spec probabilities are per minute; ticks are shorter.
  core.perTick = function (perMinute, dt) {
    return 1 - Math.pow(1 - Math.min(1, perMinute), dt / 60);
  };

  core.inOutage = function (s) {
    return s.outage.until > s.clock.runSeconds;
  };

  core.addBugs = function (s, amount, out) {
    if (core.inOutage(s)) return;
    s.bugs = Math.min(1, s.bugs + amount);
    if (s.bugs >= 1 && s.apps.some((a) => a.status === 'live')) core.startOutage(s, out);
  };

  core.startOutage = function (s, out) {
    const O = B.outage;
    if (core.inOutage(s)) return false;
    const goal = Math.min(O.maxKeys, O.keys + O.keysPerOutage * s.outage.count);
    s.outage = { until: s.clock.runSeconds + O.seconds, keys: 0, goal, count: s.outage.count + 1 };
    s.bugs = 1;
    for (const app of s.apps) app.revenue = 0;
    s.stats.outages += 1;
    out.push({ type: 'outage', goal });
    return true;
  };

  function endOutage(s, out, byPlayer) {
    s.outage.until = 0;
    s.bugs = 0;
    if (byPlayer) s.stats.firesOut += 1;
    out.push({ type: 'outageEnd', byPlayer });
  }

  // Every key during an outage fights the fire.
  core.fightOutage = function (s, out) {
    if (!core.inOutage(s)) return;
    s.outage.keys += 1;
    if (s.outage.keys >= s.outage.goal) endOutage(s, out, true);
  };

  core.tickQuality = function (s, dt, out) {
    if (s.outage.until > 0 && !core.inOutage(s)) endOutage(s, out, false);
    // with Accept All off, agents clean up after themselves
    if (!s.acceptAll.on && !core.inOutage(s)) s.bugs = Math.max(0, s.bugs - B.bugs.drainPerSecond * dt);
  };
})(window.Game = window.Game || {});
