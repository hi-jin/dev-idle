// Apps: creating, releasing, users and revenue (FR-15), and updates (FR-17).
// The apps come in a fixed order: releasing one opens the next.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  core.findApp = function (s, id) {
    return s.apps.find((a) => a.id === id) || null;
  };

  core.createApp = function (s, template) {
    const def = G.content.apps[template];
    s.stats.appsCreated[template] = (s.stats.appsCreated[template] || 0) + 1;
    const app = {
      id: core.newId(s, 'p'),
      template,
      name: def.name,
      status: 'building',
      tasks: [],
      users: 0,
      quality: B.market.baseQuality,
      revenue: 0,
      releasedAt: null,
      readyNotified: false,
      updates: 0,
    };
    const parts = B.apps[template].work || 1;
    for (const f of def.release) for (let i = 0; i < parts; i++) app.tasks.push(core.makeTask(s, app, f, 'feature', i, parts));
    s.apps.push(app);
    return app;
  };

  // The next app in the order that this stage allows and this run has not started.
  core.nextTemplate = function (s) {
    return B.appOrder.find((t) => B.apps[t].stage <= s.stage && !s.apps.some((a) => a.template === t)) || null;
  };

  // Keeps something to build: the next app once the last one is out, and an
  // update when every app is released and no work is left.
  core.ensureWork = function (s, out) {
    if (!s.apps.some((a) => a.status === 'building')) {
      const next = core.nextTemplate(s);
      if (next) {
        const app = core.createApp(s, next);
        core.fillAll(s);
        if (out) out.push({ type: 'appCreated', appId: app.id });
      }
    }
    if (!s.apps.some((a) => a.tasks.some((t) => !t.done))) core.planAnyUpdate(s);
  };

  core.isReleaseReady = function (app) {
    return app.status === 'building' && app.tasks.every((t) => t.kind !== 'feature' || t.done);
  };

  // Launch-day sales: some minutes of the app's base revenue, paid at once.
  core.launchBonus = function (s, app) {
    const cfg = B.apps[app.template];
    return cfg.market * cfg.arpu * B.market.launchMinutes * core.revenueMultiplier(s);
  };

  core.releaseApp = function (s, appId, out) {
    const app = core.findApp(s, appId);
    if (!app || !core.isReleaseReady(app)) return false;
    const bonus = core.launchBonus(s, app);
    app.status = 'live';
    app.releasedAt = s.clock.runSeconds;
    app.tasks = [];
    s.money += bonus;
    s.runRevenue += bonus;
    s.stats.released += 1;
    core.gainFollowers(s, B.apps[app.template].market * B.social.releaseFollowersPerUser);
    out.push({ type: 'released', appId: app.id, bonus });
    return true;
  };

  core.revenueMultiplier = function (s) {
    return (1 + core.bonus(s, 'revenue')) * (1 + B.exit.revenuePerPoint * s.prestige.points) * (1 - s.investor.dilution);
  };

  core.followerMultiplier = function (s) {
    return 1 + B.social.followerUsersPerLog * Math.log10(1 + s.social.followers);
  };

  core.userTarget = function (s, app) {
    const viral = core.viralApp(s, app) ? B.events.viral.users : 1;
    const ads = 1 + B.ads.usersPerLevel * s.upgrades.ads;
    return B.apps[app.template].market * app.quality * core.followerMultiplier(s) * viral * ads;
  };

  core.tickMarket = function (s, dt) {
    const mult = core.revenueMultiplier(s);
    const k = Math.min(1, B.market.userGrowthPerSecond * dt);
    const down = core.inOutage(s);
    for (const app of s.apps) {
      if (app.status !== 'live') continue;
      // a company that is down earns nothing and gains no users
      if (down) {
        app.revenue = 0;
        continue;
      }
      app.users += (core.userTarget(s, app) - app.users) * k;
      app.revenue = app.users * B.apps[app.template].arpu * mult;
      const earned = (app.revenue / 60) * dt;
      s.money += earned;
      s.runRevenue += earned;
    }
  };

  // ---------- updates ----------

  // The next update from the template's list, cycling with a version number.
  core.nextUpdate = function (s, app) {
    const list = G.content.apps[app.template].updates;
    const f = list[app.updates % list.length];
    const round = Math.floor(app.updates / list.length);
    return { name: round ? `${f.name} v${round + 1}` : f.name, difficulty: f.difficulty, tag: f.tag };
  };

  core.canUpdate = function (s, app) {
    if (!app || app.status !== 'live') return 'notLive';
    if (app.tasks.some((t) => t.kind === 'update' && !t.done)) return 'pending';
    return null;
  };

  // Starts an update for the biggest live app that has none in progress.
  core.planAnyUpdate = function (s) {
    const app = s.apps
      .filter((a) => !core.canUpdate(s, a))
      .sort((x, y) => B.apps[y.template].market - B.apps[x.template].market)[0];
    if (!app) return false;
    app.tasks.push(core.makeTask(s, app, core.nextUpdate(s, app), 'update'));
    return true;
  };

  // Each update is worth less than the last (spec 6.9).
  core.applyUpdate = function (s, app, task, out) {
    const weight = Math.pow(B.updates.decay, app.updates) * (1 + core.bonus(s, 'updateEffect'));
    app.quality = Math.min(B.market.maxQuality, app.quality + B.tasks[task.difficulty].quality * weight);
    app.updates += 1;
    app.tasks = app.tasks.filter((t) => t !== task);
    out.push({ type: 'updated', appId: app.id, name: task.name });
  };

  core.companyRevenue = function (s) {
    return s.apps.reduce((sum, a) => sum + (a.status === 'live' ? a.revenue : 0), 0);
  };

  // What the company would earn with every app up: used for prices and
  // rewards, so an outage does not make them free.
  core.steadyRevenue = function (s) {
    const mult = core.revenueMultiplier(s);
    return s.apps.reduce((sum, a) => sum + (a.status === 'live' ? a.users * B.apps[a.template].arpu * mult : 0), 0);
  };

  core.totalUsers = function (s) {
    return s.apps.reduce((sum, a) => sum + (a.status === 'live' ? a.users : 0), 0);
  };

  core.valuation = function (s) {
    return core.steadyRevenue(s) * B.market.valuationMultiple;
  };
})(window.Game = window.Game || {});
