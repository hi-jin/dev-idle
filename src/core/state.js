// Game state shape and creation (spec section 4). Core files never touch the DOM.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});

  // Version 6 (2026-11-11): the simplified game. Older saves do not carry over.
  core.STATE_VERSION = 6;

  core.defaults = function () {
    return {
      version: core.STATE_VERSION,
      rng: 1,
      demo: false,
      clock: { runSeconds: 0, totalSeconds: 0 },
      money: 0,
      runRevenue: 0,
      stage: 1,
      dev: { typing: 0, prompt: 0, review: 0 },
      typing: { taskId: null, snippetId: null, pos: 0, bucket: -1, bucketKeys: 0, lastLines: 0, heat: 0 },
      caffeine: { gauge: 0, fever: null, drinkReadyAt: 0, next: 'typing', boost: { value: 0, until: 0 } },
      acceptAll: { on: false },
      // the bug gauge (0 to 1) and the outage it sets off when full
      bugs: 0,
      outage: { until: 0, keys: 0, goal: 0, count: 0 },
      upgrades: { template: 0, autoCompress: -1, autoCompressOn: true, localGear: 0, ads: 0 },
      agents: [],
      apps: [],
      stats: {
        keys: 0, tasksDone: 0, tasksFailed: 0, bugsShipped: 0, released: 0, appsCreated: {},
        fevers: 0, bestCpm: 0, compacts: 0, perfectCompacts: 0, perfectStreak: 0,
        outages: 0, firesOut: 0, bugsSquashed: 0, outageFreeSeconds: 0, events: 0,
        prompts: 0, reviewCards: 0, bugsFoundInReview: 0,
      },
      social: { followers: 0, achievements: {}, posted: {}, league: 0 },
      investor: { dilution: 0 },
      events: { current: null, readyAt: 0 },
      prestige: { points: 0, exits: 0, bestStage: 1, bestValuation: 0, bestSeconds: 0 },
      // the first-run tutorial: the step it is on (ui/tutorial.js has the steps)
      tutorial: { step: 0, done: false },
      // this run's growth samples and choices, for the chart (forecast.js)
      log: { samples: [], marks: [], at: 0, eff: 0, id: 0 },
      nextId: 1,
    };
  };

  core.createState = function (opts) {
    const o = opts || {};
    const s = core.defaults();
    s.rng = G.rng.seedFrom(o.seed == null ? Date.now() : o.seed);
    s.demo = !!o.demo;
    core.createApp(s, 'todo');
    return s;
  };

  core.newId = function (s, prefix) {
    return prefix + s.nextId++;
  };
})(window.Game = window.Game || {});
