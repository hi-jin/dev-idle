// Developer stages and unlocks (FR-18), and selling the company (FR-22).
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  core.nextStage = function (s) {
    return B.stages.find((x) => x.stage === s.stage + 1) || null;
  };

  // A stage is reached by releasing its app. Stages never go back down.
  core.stageReached = function (s, rule) {
    return s.apps.some((a) => a.status === 'live' && a.template === rule.release);
  };

  // The app to release for the next stage and how far along it is (0 to 1).
  core.stageProgress = function (s) {
    const next = core.nextStage(s);
    if (!next) return null;
    const app = s.apps.find((a) => a.template === next.release);
    let value = 0;
    if (app) {
      const total = app.tasks.reduce((n, t) => n + t.lines, 0);
      value = total ? app.tasks.reduce((n, t) => n + Math.min(t.lines, t.progress), 0) / total : 1;
    }
    return { next, template: next.release, value, goal: 1 };
  };

  core.checkStage = function (s, out) {
    let next = core.nextStage(s);
    while (next && core.stageReached(s, next)) {
      s.stage = next.stage;
      // a quiet moment after the stage-up before the next random event
      s.events.readyAt = Math.max(s.events.readyAt, s.clock.runSeconds + B.events.stageQuietSeconds);
      out.push({ type: 'stage', stage: s.stage });
      next = core.nextStage(s);
    }
    core.ensureWork(s, out);
  };

  // ---------- exit ----------

  core.canExit = function (s) {
    if (s.stage < B.exit.stage) return 'stage';
    if (core.valuation(s) < B.exit.minValuation) return 'value';
    return null;
  };

  // The grade a sale at this valuation gets: C, B, A or S.
  core.exitGrade = function (valuation) {
    let grade = B.exit.grades[0];
    for (const g of B.exit.grades) if (valuation >= g.from) grade = g;
    return grade.id;
  };

  // The next grade up and the valuation it needs, or null at the top.
  core.nextGrade = function (valuation) {
    return B.exit.grades.find((g) => g.from > valuation) || null;
  };

  // Founder points follow the best sale so far: 10 x cbrt(valuation / $1M) in
  // total, so a sale only pays the points above what you already have.
  core.exitPoints = function (s) {
    const E = B.exit;
    const total = Math.floor(E.pointsScale * Math.pow(core.valuation(s) / 1e6, E.pointsPower) * (1 + core.bonus(s, 'points')));
    return Math.max(0, total - s.prestige.points);
  };

  core.startCash = function (s) {
    return B.exit.cashPerPoint * s.prestige.points * (1 + core.bonus(s, 'startCash'));
  };

  // Sells the company and ends the run: founder points, achievements,
  // followers and stats stay; everything else starts over (spec 6.13).
  core.exitCompany = function (s, out) {
    if (core.canExit(s)) return false;
    const value = core.valuation(s);
    const points = core.exitPoints(s);
    const seconds = s.clock.runSeconds;
    const result = {
      type: 'exit', value, points, seconds, grade: core.exitGrade(value), stage: s.stage,
      apps: s.apps.filter((a) => a.status === 'live').length, agents: s.agents.length,
      bestBefore: s.prestige.bestValuation, exits: s.prestige.exits + 1,
      // the run's growth and choices, for the chart on the result card
      log: s.log,
    };
    s.prestige.points += points;
    s.prestige.exits += 1;
    s.prestige.bestStage = Math.max(s.prestige.bestStage, s.stage);
    s.prestige.bestValuation = Math.max(s.prestige.bestValuation, value);

    const keep = {
      version: s.version, rng: s.rng, demo: s.demo, nextId: s.nextId,
      prestige: s.prestige, social: s.social, stats: s.stats, tutorial: s.tutorial,
      clock: { runSeconds: 0, totalSeconds: s.clock.totalSeconds },
    };
    for (const k of Object.keys(s)) delete s[k];
    Object.assign(s, core.defaults(), keep);
    s.stats.appsCreated = {};
    s.social.league = 0;
    s.money = core.startCash(s);
    core.createApp(s, 'todo');
    out.push(result);
    return true;
  };

  // What a stage opens up, for the stage-up message and locked labels.
  core.unlocksAt = function (stage) {
    return {
      apps: B.appOrder.filter((t) => B.apps[t].stage === stage),
      agents: B.agentOrder.filter((k) => B.agents[k].stage === stage),
      fevers: core.FEVER_KINDS.filter((k) => k !== 'typing' && B.feverKinds[k] === stage),
      acceptAll: B.acceptAll.stage === stage,
    };
  };
})(window.Game = window.Game || {});
