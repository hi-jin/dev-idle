// Every tunable number lives here (spec section 6). Names follow the spec tables.
(function (G) {
  'use strict';

  G.balance = {
    tickSeconds: 0.1,

    typing: {
      linesPerKey: 0.5,
      skillMultiplier: 1.35,
      charsPerKey: 3,
      maxKeysPerSecond: 15,
      // caffeine mode (FR-03)
      gaugeMax: 250,
      feverSeconds: 20,
      feverMaxKeysPerSecond: 20,
      // on touch screens caffeine mode asks to pick the next 4 characters out of three (FR-30)
      chunkChars: 4,
      feverBase: 5,
      feverComboStep: 10,
      feverComboBonus: 0.5,
      feverMax: 10,
    },

    // Typing heat (2026-11-11): every key you press hurries your agents. Heat
    // fades when you stop, so typing matters all game long.
    heat: { perKey: 4, max: 100, decayPerSecond: 12, agentBoost: 1 },

    drink: { minPrice: 20, revenueMinutes: 2, cooldownSeconds: 180 },

    // From stage 3 the player picks what the next caffeine mode is (FR-05, FR-06).
    // Prompt and review mode ignore input for their first second, so keys still
    // being pressed when the gauge fills do not count as mistakes.
    feverKinds: { typing: 1, prompt: 3, review: 4 },
    prompt: { readySeconds: 1, perPrompt: 0.02, sloppy: 0.01, sloppyTypos: 3, max: 0.1, seconds: 120 },
    // Revenue seconds raised from the spec's 5 and 2, and the wait from 2 (2026-10-30):
    // a review round paid back only about a sixth of the energy drink that starts it.
    review: { readySeconds: 1, bugs: 0.12, bugRevenueSeconds: 30, cleanRevenueSeconds: 10, wrongSeconds: 3 },

    tasks: {
      // bugs: how much of the bug gauge one Accept All failure fills
      1: { lines: 20, quality: 0.05, bugs: 0.08 },
      2: { lines: 100, quality: 0.1, bugs: 0.14 },
      3: { lines: 400, quality: 0.2, bugs: 0.22 },
      4: { lines: 1500, quality: 0.35, bugs: 0.32 },
    },

    appOrder: ['todo', 'photo', 'shop', 'team', 'ai'],
    apps: {
      // work: every feature of the app comes in this many parts (each a task
      // of its own), so a bigger company has minutes of building ahead of it
      // and room for many agents at once
      todo: { stage: 1, market: 200, arpu: 0.25, work: 1 },
      photo: { stage: 2, market: 2000, arpu: 0.25, work: 1 },
      shop: { stage: 3, market: 20000, arpu: 0.4, work: 5 },
      team: { stage: 4, market: 200000, arpu: 0.5, work: 5 },
      ai: { stage: 5, market: 2000000, arpu: 0.6, work: 6 },
    },

    market: {
      baseQuality: 0.5,
      maxQuality: 3.0,
      userGrowthPerSecond: 0.12,
      valuationMultiple: 1000,
      // a release pays this many minutes of the app's base revenue at once
      launchMinutes: 1.5,
    },

    ads: { usersPerLevel: 0.25 },
    updates: { decay: 0.9 },

    // followers, rivals and leagues
    social: {
      followerUsersPerLog: 0.1,
      releaseFollowersPerUser: 0.01,
      postFollowers: { bronze: 50, silver: 500, gold: 5000 },
      leagueFollowerMult: [1, 3, 10],
      leagues: [0, 1e6, 1e8],
      leagueCashMinutes: 2,
    },

    // exit (FR-22): selling ends the run with a grade by valuation
    exit: {
      stage: 3, minValuation: 1e6, pointsScale: 10, pointsPower: 1 / 3, revenuePerPoint: 0.02, typingPerPoint: 0.01, cashPerPoint: 100,
      grades: [{ id: 'C', from: 0 }, { id: 'B', from: 1.5e7 }, { id: 'A', from: 3e8 }, { id: 'S', from: 5e9 }],
    },

    // random events (FR-23): one at a time, about one a minute from stage 2
    events: {
      stage: 2,
      perMinute: 1.5,
      cooldownSeconds: 25,
      choiceSeconds: 20,
      stageQuietSeconds: 15,
      weights: { hallucination: 35, viral: 25, investor: 20, oss: 20 },
      // a hallucinated bug crawls over the desk: squash it for cash, or it joins the bug gauge
      bug: { seconds: 10, revenueSeconds: 45, minCash: 10, missBugs: 0.1 },
      viral: { seconds: 45, users: 3 },
      investor: { revenueMinutes: 4, dilution: 0.05, maxDilution: 0.25, declineShare: 0.1, declineMin: 20 },
      oss: { keys: 60, share: 0.05, min: 50 },
    },

    // offline progress (FR-27)
    offline: { maxSeconds: 8 * 3600, tickSeconds: 10, agentSpeed: 0.5, minSeconds: 60 },

    agentOrder: ['auto', 'bulk', 'precise', 'longctx', 'local'],
    agents: {
      // speed: lines a second per task; context: lines before it fills up (0 = never)
      auto: { stage: 2, price: 30, speed: 1.5, concurrency: 1, accuracy: [0.9, 0.6, 0.25, 0.05], context: 0 },
      bulk: { stage: 2, price: 400, speed: 2.5, concurrency: 3, accuracy: [0.95, 0.8, 0.6, 0.35], context: 800 },
      precise: { stage: 3, price: 4000, speed: 10, concurrency: 1, accuracy: [0.98, 0.92, 0.85, 0.7], context: 1500 },
      longctx: { stage: 3, price: 10000, speed: 8, concurrency: 2, accuracy: [0.92, 0.75, 0.55, 0.35], context: 20000 },
      local: { stage: 4, price: 80000, speed: 12, concurrency: 2, accuracy: [0.85, 0.65, 0.4, 0.2], context: 0 },
    },
    agentPriceGrowth: 1.5,
    // letting an agent go pays this share of its price back
    agentRefund: 0.3,
    agentSlots: { 1: 0, 2: 2, 3: 4, 4: 6, 5: 8 },
    // each Prompt skill level makes every agent this much faster
    promptSpeed: 1.25,

    // Context and compacting (FR-12, FR-13). A full agent is not stuck, only
    // slow; compacting by hand empties it and starts a focus boost that is
    // stronger the better the summary. Auto-compacting empties it with no boost.
    context: {
      slow: 0.5,
      manualFrom: 0.5,
      perfectAt: 0.95,
      focusSeconds: 40,
      focusMin: 1.3,
      focusMax: 2.5,
      focusPerTemplate: 0.1,
    },
    minigame: {
      rounds: 3,
      periodByStage: { 1: 1.4, 2: 1.4, 3: 1.2, 4: 1.0, 5: 0.8 },
      perfect: 0.06,
      good: 0.15,
      templateGrowth: 1.2,
      scores: { perfect: 1, good: 0.7, miss: 0.3 },
      roundTimeoutSeconds: 10,
    },

    probability: { min: 0.05, max: 0.98, pityStreak: 3, pityBonus: 0.1 },
    // takeOver: a free agent takes a task from one it is at least this many times faster than
    assignment: { minChance: 0.7, takeOver: 1.3 },
    // An agent that fails a task redoes half of it. With Accept All on, agents
    // work faster and a failure ships anyway, filling the bug gauge instead.
    failure: { visibleProgressKeep: 0.75 },
    acceptAll: { stage: 3, speed: 1.3 },

    // The bug gauge (2026-11-11). Full means an outage: no revenue and no agent
    // work until the player types the fire out, or it burns out on its own.
    // Each fire in a run takes more keys than the last.
    bugs: { drainPerSecond: 0.005, perReview: 0.15, partPower: 0.6 },
    outage: { seconds: 30, keys: 30, keysPerOutage: 10, maxKeys: 80 },

    // A stage is reached by releasing an app; each release opens the next app.
    stages: [
      { stage: 2, release: 'todo' },
      { stage: 3, release: 'photo' },
      { stage: 4, release: 'shop' },
      { stage: 5, release: 'team' },
    ],

    shop: {
      typing: { base: 20, growth: 2.5, max: 10, stage: 1 },
      prompt: { base: 300, growth: 3, max: 8, stage: 2 },
      review: { base: 2000, growth: 4, max: 4, stage: 3 },
      template: { base: 1500, growth: 3, max: 5, stage: 3 },
      autoCompress: { prices: [5000], stage: 3 },
      localGear: { base: 50000, growth: 3, max: 5, stage: 4 },
      // repeatable, so there is always something to buy
      ads: { base: 5000, growth: 2.2, max: 100, stage: 3 },
    },

    // the growth chart: a sample every 2 seconds, thinned when the run gets long
    log: { sampleSeconds: 2, maxSamples: 900, maxMarks: 300 },

    save: { intervalSeconds: 10 },
  };
})(window.Game = window.Game || {});
