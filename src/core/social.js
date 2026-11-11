// Followers, rival companies, leagues and achievements (FR-19, FR-20, FR-21).
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;
  const C = G.content;

  core.gainFollowers = function (s, n) {
    s.social.followers += Math.max(0, Math.round(n));
  };

  // ---------- rivals and leagues ----------

  core.npcValuation = function (s, npc) {
    return npc.base * Math.pow(1 + npc.growth, s.clock.runSeconds / 60);
  };

  core.leagueOf = function (valuation) {
    const L = B.social.leagues;
    let league = 0;
    for (let i = 0; i < L.length; i++) if (valuation >= L[i]) league = i;
    return league;
  };

  // Every company with its valuation, best first; the player's row has id "you".
  core.ranking = function (s) {
    const rows = C.npcs.map((n) => ({ id: n.id, name: n.name, valuation: core.npcValuation(s, n) }));
    rows.push({ id: 'you', name: null, valuation: core.valuation(s) });
    return rows.sort((a, b) => b.valuation - a.valuation);
  };

  // ---------- achievements ----------

  const KINDS = ['auto', 'bulk', 'precise', 'longctx', 'local'];
  const CONDITIONS = {
    firstRelease: (s) => s.stats.released >= 1,
    firstAgent: (s) => s.agents.length >= 1,
    caffeineAddict: (s) => s.stats.fevers >= 10,
    cpm400: (s) => s.stats.bestCpm >= 400,
    perfectSummary: (s) => s.stats.perfectCompacts >= 1,
    summaryMaster: (s) => s.stats.perfectStreak >= 10,
    noOutageHour: (s) => s.stats.outageFreeSeconds >= 600,
    justAcceptedAll: (s) => s.stats.outages >= 5,
    collector: (s) => KINDS.every((k) => s.agents.some((a) => a.kind === k)),
    firefighter: (s) => s.stats.firesOut >= 3,
    bugHunter: (s) => s.stats.bugsSquashed >= 10,
    promptEngineer: (s) => s.stats.prompts >= 20,
    carefulReviewer: (s) => s.stats.bugsFoundInReview >= 25,
    national: (s) => s.social.league >= 1,
    global: (s) => s.social.league >= 2,
    firstExit: (s) => s.prestige.exits >= 1,
    serialFounder: (s) => s.prestige.exits >= 3,
  };

  core.achievement = function (id) {
    return C.achievements.find((a) => a.id === id) || null;
  };

  // Sum of one reward type over unlocked achievements.
  core.bonus = function (s, type) {
    let sum = 0;
    for (const a of C.achievements) if (s.social.achievements[a.id] && a.reward[type]) sum += a.reward[type];
    return sum;
  };

  core.checkAchievements = function (s, out) {
    for (const a of C.achievements) {
      if (s.social.achievements[a.id] || !CONDITIONS[a.id](s)) continue;
      s.social.achievements[a.id] = true;
      out.push({ type: 'achievement', id: a.id });
    }
  };

  // Posting an achievement brings followers, more in higher leagues.
  core.canPostAchievement = function (s, id) {
    return !!s.social.achievements[id] && !s.social.posted[id];
  };

  core.postAchievement = function (s, id, out) {
    if (!core.canPostAchievement(s, id)) return false;
    const a = core.achievement(id);
    const n = B.social.postFollowers[a.tier] * B.social.leagueFollowerMult[s.social.league];
    s.social.posted[id] = true;
    core.gainFollowers(s, n);
    out.push({ type: 'posted', id, followers: n });
    return true;
  };

  // ---------- each tick ----------

  core.tickSocial = function (s, dt, out) {
    // leagues only go up within a run
    const league = core.leagueOf(core.valuation(s));
    if (league > s.social.league) {
      const cash = core.steadyRevenue(s) * B.social.leagueCashMinutes;
      s.social.league = league;
      s.money += cash;
      out.push({ type: 'league', league, cash });
    }

    const live = s.apps.some((a) => a.status === 'live');
    if (core.inOutage(s)) s.stats.outageFreeSeconds = 0;
    else if (live) s.stats.outageFreeSeconds += dt;

    s.prestige.bestValuation = Math.max(s.prestige.bestValuation, core.valuation(s));
    core.checkAchievements(s, out);
  };
})(window.Game = window.Game || {});
