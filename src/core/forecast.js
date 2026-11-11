// The run's log (growth samples and the player's choices) and forecasts
// (2026-11-11). A forecast plays a copy of the game forward with no dice:
// agent work is scaled by its expected success, no random events happen, and
// apps are released the moment they are ready. So two forecasts differ only
// by the choice being compared. Forecasts are rough guides, not promises.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  // ---------- the log ----------

  // A choice or a milestone on the growth chart.
  core.logMark = function (s, kind, what) {
    const L = s.log;
    if (s.sim || !L) return null;
    const mark = { id: ++L.id, t: Math.round(s.clock.runSeconds), k: kind, w: what || '' };
    L.marks.push(mark);
    if (L.marks.length > B.log.maxMarks) L.marks.shift();
    return mark;
  };

  // Marks for what an action and its notes did. Returns the mark of the
  // player's own choice (a hire, an upgrade, the Accept All switch), if any.
  core.logAction = function (s, action, ok, notes) {
    if (s.sim) return null;
    let choice = null;
    if (ok && action) {
      if (action.type === 'buyAgent') choice = core.logMark(s, 'hire', action.kind);
      else if (action.type === 'buyUpgrade') choice = core.logMark(s, 'upgrade', action.key);
      else if (action.type === 'acceptAll') choice = core.logMark(s, action.on ? 'acceptOn' : 'acceptOff');
      else if (action.type === 'fireAgent') choice = core.logMark(s, 'dismiss', action.kind);
    }
    for (const n of notes) {
      if (n.type === 'released') core.logMark(s, 'release', (core.findApp(s, n.appId) || {}).template);
      else if (n.type === 'outage') core.logMark(s, 'fire');
    }
    return choice;
  };

  // Every couple of seconds: [time, valuation, effective keys a second].
  // "Effective" counts a caffeine-mode key as the several keys it is worth.
  core.tickLog = function (s, dt) {
    const L = s.log;
    if (s.sim || !L) return;
    const now = s.clock.runSeconds;
    const every = B.log.sampleSeconds;
    if (now - L.at < every - 1e-6) return;
    const kps = Math.round(((L.eff || 0) / Math.max(every, now - L.at)) * 10) / 10;
    L.samples.push([Math.round(now), Math.round(core.valuation(s)), kps]);
    L.eff = 0;
    L.at = now;
    // an old run thins out: every other sample of the older half goes
    if (L.samples.length > B.log.maxSamples) {
      const half = Math.floor(L.samples.length / 2);
      L.samples = L.samples.filter((x, i) => i >= half || i % 2 === 0);
    }
  };

  // ---------- forecasts ----------

  // How much of an agent's work counts once its expected failures are
  // redone (Accept All off). 1 when it never fails.
  core.expectedYield = function (s, agent, difficulty) {
    const p = core.successChance(s, agent, difficulty);
    return 1 / (1 + ((1 - p) / p) * (1 - B.failure.visibleProgressKeep));
  };

  // A copy to play forward: no dice, no random events, no log.
  core.simClone = function (s) {
    const c = JSON.parse(JSON.stringify(s, (k, v) => (k === 'log' ? undefined : v)));
    c.sim = true;
    c.log = null;
    c.events = { current: null, readyAt: 1e12 };
    c.caffeine.fever = null;
    return c;
  };

  function buildingProgress(c) {
    let sum = 0;
    for (const app of c.apps) if (app.status === 'building') for (const t of app.tasks) sum += Math.min(t.lines, t.progress);
    return sum;
  }

  // One step of a forecast: the player types `kps` effective keys a second.
  // Fills `rec` with releases and outages.
  core.simStep = function (c, dt, kps, rec) {
    const H = B.heat;
    const out = [];
    if (kps > 0) {
      if (core.inOutage(c)) {
        const n = Math.round(kps * dt);
        for (let i = 0; i < n && core.inOutage(c); i++) core.fightOutage(c, out);
      }
      const target = core.peekTypingTarget(c);
      if (target) {
        const agent = target.task.assignee ? core.findAgent(c, target.task.assignee) : null;
        const was = target.app.status === 'building' ? Math.min(target.task.lines, target.task.progress) : null;
        core.addProgress(c, target.app, target.task, core.linesPerKey(c) * kps * dt, agent, out);
        if (rec && was !== null) rec.work += Math.max(0, Math.min(target.task.lines, target.task.progress) - was);
      }
    }
    // the heat the typing rate settles at; the tick takes its fade off again
    const steady = Math.min(H.max, (H.max * kps * H.perKey) / (H.decayPerSecond * 1.5));
    c.typing.heat = steady + H.decayPerSecond * dt;
    const before = rec ? buildingProgress(c) : 0;
    for (const n of core.tick(c, dt)) out.push(n);
    // lines written on the app being built, before a release clears its tasks
    if (rec) rec.work += Math.max(0, buildingProgress(c) - before);
    for (const app of c.apps) {
      if (core.isReleaseReady(app)) {
        core.releaseApp(c, app.id, out);
        core.checkStage(c, out);
      }
    }
    if (rec) {
      for (const n of out) {
        if (n.type === 'released') rec.releases.push({ t: c.clock.runSeconds, template: (core.findApp(c, n.appId) || {}).template });
        else if (n.type === 'outage') rec.outages += 1;
      }
    }
  };

  // Plays `c` forward. opts: seconds, dt, kps (a number or a function of run
  // time), decisions ([{ t, action }] to replay when their time comes; one
  // that cannot be afforded yet waits). Returns the valuation over time.
  core.simulate = function (c, opts) {
    const dt = opts.dt || 1;
    const rec = { series: [[c.clock.runSeconds, core.valuation(c)]], releases: [], outages: 0, work: 0, rate: 0 };
    const start = c.clock.runSeconds;
    let rated = false;
    // how far along the app being built is (0 to 1), until it is released
    const first = c.apps.find((a) => a.status === 'building') || null;
    const total = first ? first.tasks.reduce((n, t) => n + t.lines, 0) : 0;
    const done = () => {
      const app = first && core.findApp(c, first.id);
      if (!app || app.status !== 'building' || !total) return 1;
      return app.tasks.reduce((n, t) => n + Math.min(t.lines, t.progress), 0) / total;
    };
    rec.progress = first ? [[start, done()]] : [];
    let building = !!first;
    const pending = (opts.decisions || []).slice();
    const kpsAt = typeof opts.kps === 'function' ? opts.kps : () => opts.kps || 0;
    const end = c.clock.runSeconds + opts.seconds;
    while (c.clock.runSeconds < end - 1e-9) {
      while (pending.length && pending[0].t <= c.clock.runSeconds) {
        if (core.act(c, pending[0].action).ok || c.clock.runSeconds - pending[0].t > 60) pending.shift();
        else break;
      }
      core.simStep(c, dt, kpsAt(c.clock.runSeconds), rec);
      rec.series.push([c.clock.runSeconds, core.valuation(c)]);
      if (building) {
        const f = done();
        rec.progress.push([c.clock.runSeconds, f]);
        if (f >= 1) building = false;
      }
      // the building speed: lines a second over the first half minute, or up to the first release
      if (!rated && (c.clock.runSeconds - start >= 30 || rec.releases.length)) {
        rated = true;
        rec.rate = rec.work / Math.max(dt, c.clock.runSeconds - start);
      }
    }
    if (!rated) rec.rate = rec.work / Math.max(dt, c.clock.runSeconds - start);
    rec.end = core.valuation(c);
    rec.stage = c.stage;
    return rec;
  };

  // What the next minutes look like from here, optionally after one more
  // choice (an action). Null when that choice is not open (locked, no desk,
  // maxed). The choice is tried even when the money is short: the preview
  // answers "what would this do", not "can I pay for it".
  core.forecast = function (s, action, opts) {
    const c = core.simClone(s);
    if (action) {
      if (action.type === 'buyAgent') {
        const why = core.canBuyAgent(c, action.kind);
        if (why && why !== 'money') return null;
        c.money = Math.max(c.money, core.agentPrice(c, action.kind));
      } else if (action.type === 'buyUpgrade') {
        const why = core.canBuyUpgrade(c, action.key);
        if (why && why !== 'money') return null;
        c.money = Math.max(c.money, core.upgradePrice(c, action.key));
      }
      if (!core.act(c, action).ok) return null;
    }
    // who writes the app being built, right after the choice
    const shares = core.workShares(c, opts.kps);
    const rec = core.simulate(c, { seconds: opts.seconds, dt: opts.dt || 1, kps: opts.kps });
    rec.shares = shares;
    return rec;
  };

  // Where the lines of the app being built come from right now: the player's
  // typing and each agent, in lines a second. For "why does this choice
  // matter (or not)".
  core.workShares = function (s, kps) {
    // agents at the heat this typing rate settles at, not at this instant's
    const H = B.heat;
    const heat = s.typing.heat;
    s.typing.heat = Math.min(H.max, (H.max * kps * H.perKey) / (H.decayPerSecond * 1.5));
    try {
      return shares(s, kps);
    } finally {
      s.typing.heat = heat;
    }
  };

  function shares(s, kps) {
    const typing = core.linesPerKey(s) * kps;
    let agents = 0;
    let idle = 0;
    for (const agent of s.agents) {
      let mine = 0;
      for (const id of agent.taskIds) {
        const f = core.findTask(s, id);
        if (!f || f.app.status !== 'building') continue;
        const yieldOf = s.acceptAll.on ? 1 : core.expectedYield(s, agent, f.task.difficulty);
        mine += core.agentSpeed(s, agent) * yieldOf;
      }
      if (!mine) idle += 1;
      agents += mine;
    }
    const app = s.apps.find((a) => a.status === 'building') || null;
    const left = app ? app.tasks.reduce((n, t) => n + Math.max(0, t.lines - t.progress), 0) : 0;
    return { typing, agents, idle, share: typing + agents > 0 ? typing / (typing + agents) : 0, building: !!app, left };
  }

  // When a forecast first reaches a valuation (run time), or null.
  core.reachTime = function (r, value) {
    for (const p of r.series) if (p[1] >= value) return p[0];
    return null;
  };

  const sooner = (a, b) => (a != null && b != null ? a - b : b != null ? Infinity : a != null ? -Infinity : null);

  // 0.25 when a wait of 100 s becomes 75 s; 1 when only the choice gets there
  // at all; -1 when only skipping it does; -Infinity when neither does.
  function saved(a, b, start) {
    if (a == null && b == null) return -Infinity;
    if (a == null) return 1;
    if (b == null) return -1;
    return a - start > 0 ? (a - b) / (a - start) : 0;
  }

  // How a forecast with a choice compares to one without: seconds the next
  // release comes sooner (null when neither releases in time), the valuation
  // gain at `at` seconds in, and extra outages.
  core.compareForecasts = function (base, alt, at, goal) {
    const first = (r) => (r.releases.length ? r.releases[0].t : null);
    const a = first(base);
    const b = first(alt);
    const start = base.series[0][0];
    const valueAt = (r) => {
      let v = r.series[0][1];
      for (const p of r.series) {
        if (p[0] - start > at) break;
        v = p[1];
      }
      return v;
    };
    const va = valueAt(base);
    const vb = valueAt(alt);
    return {
      sooner: sooner(a, b),
      gain: va > 0 ? vb / va - 1 : vb > 0 ? Infinity : 0,
      outages: alt.outages - base.outages,
      // how much faster the app being built gets written
      rate: base.rate > 0 ? alt.rate / base.rate - 1 : alt.rate > 0 ? Infinity : 0,
      // seconds sooner the valuation reaches `goal` (the next line on the chart)
      goalSooner: goal ? sooner(core.reachTime(base, goal), core.reachTime(alt, goal)) : null,
      // the share of the wait for the next release or goal that the choice saves
      saved: Math.max(saved(a, b, start), goal ? saved(core.reachTime(base, goal), core.reachTime(alt, goal), start) : -Infinity),
    };
  };

  // "What if I had not made that choice": plays the game from just before
  // it, twice, replaying every later choice: once with the choice and once
  // without. Both are forecasts, so they compare fairly.
  //   snapshot: the state (JSON) just before the choice
  //   action:   the choice itself
  //   later:    [{ t, action }] the choices after it, oldest first
  //   kps:      function of run time, the typing rate back then
  core.whatIf = function (snapshot, action, later, until, kps, dt) {
    const play = (withChoice) => {
      const c = core.simClone(JSON.parse(snapshot));
      if (withChoice) core.act(c, action);
      return core.simulate(c, { seconds: Math.max(0, until - c.clock.runSeconds), dt: dt || 1, kps, decisions: later });
    };
    const taken = play(true);
    const skipped = play(false);
    return { taken, skipped, ratio: skipped.end > 0 ? taken.end / skipped.end : taken.end > 0 ? Infinity : 1 };
  };
})(window.Game = window.Game || {});
