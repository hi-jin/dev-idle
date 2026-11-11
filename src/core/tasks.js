// Tasks, progress and success rolls (FR-07, FR-09, FR-10).
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  // A feature of a bigger app comes in several parts, each its own task, so
  // several agents can build one feature at the same time. An update stays
  // one task, as long as all the parts of a feature together.
  core.makeTask = function (s, app, feature, kind, part, parts) {
    const work = B.apps[app.template].work || 1;
    return {
      id: core.newId(s, 't'),
      appId: app.id,
      name: feature.name,
      kind,
      difficulty: feature.difficulty,
      tag: feature.tag,
      part: part || 0,
      parts: parts || 1,
      lines: B.tasks[feature.difficulty].lines * (parts ? 1 : work),
      progress: 0,
      assignee: null,
      done: false,
    };
  };

  core.findTask = function (s, taskId) {
    if (!taskId) return null;
    for (const app of s.apps) {
      const task = app.tasks.find((t) => t.id === taskId);
      if (task) return { app, task };
    }
    return null;
  };

  core.openTasks = function (app) {
    return app.tasks.filter((t) => !t.done && !t.assignee);
  };

  core.contextRatio = function (agent) {
    const cap = B.agents[agent.kind].context;
    return cap ? Math.min(1, (agent.context || 0) / cap) : 0;
  };

  // Spec 6.6. `agent` may be a real agent or { kind } for previews.
  core.successChance = function (s, agent, difficulty) {
    const P = B.probability;
    let p = B.agents[agent.kind].accuracy[difficulty - 1];
    if (agent.kind === 'local') p += 0.03 * (s.upgrades.localGear || 0);
    p += core.promptBoost(s);
    p += core.bonus(s, 'accuracy');
    if ((agent.failStreak || 0) >= P.pityStreak) p += P.pityBonus;
    return Math.min(P.max, Math.max(P.min, p));
  };

  // How much of the bug gauge a failure fills with Accept All on.
  // A part of a feature is a smaller failure than a whole feature.
  core.bugGain = function (s, difficulty, parts) {
    const less = Math.max(0, 1 - B.bugs.perReview * s.dev.review - core.bonus(s, 'bugs'));
    return (B.tasks[difficulty].bugs * less) / Math.pow(parts || 1, B.bugs.partPower);
  };

  core.addProgress = function (s, app, task, lines, agent, out) {
    if (task.done) return;
    // a forecast rolls no dice: expected failures are redone as slower work
    if (s.sim && agent && !s.acceptAll.on) lines *= core.expectedYield(s, agent, task.difficulty);
    task.progress += lines;
    if (task.progress >= task.lines) core.finishTask(s, app, task, agent, out);
  };

  // Work typed by the player always succeeds; agent work is rolled. A failed
  // task goes back to half, unless Accept All is on: then it ships anyway and
  // the bug goes into the gauge.
  core.finishTask = function (s, app, task, agent, out) {
    let bug = false;
    if (agent) {
      const p = core.successChance(s, agent, task.difficulty);
      if (s.sim) {
        // in a forecast the expected share of a bug ships with Accept All on
        if (s.acceptAll.on) core.addBugs(s, (1 - p) * core.bugGain(s, task.difficulty, task.parts), out);
      } else if (G.rng.next(s) >= p) {
        if (!s.acceptAll.on) {
          task.progress = task.lines * B.failure.visibleProgressKeep;
          agent.failStreak += 1;
          agent.failed += 1;
          s.stats.tasksFailed += 1;
          out.push({ type: 'taskFailed', appId: app.id, taskId: task.id, agentId: agent.id });
          return;
        }
        bug = true;
        s.stats.bugsShipped += 1;
        core.addBugs(s, core.bugGain(s, task.difficulty, task.parts), out);
      }
      agent.failStreak = 0;
      agent.done += 1;
    }
    task.done = true;
    task.progress = task.lines;
    if (task.assignee) core.unassignTask(s, task);
    if (task.kind === 'feature') {
      app.quality = Math.min(B.market.maxQuality, app.quality + B.tasks[task.difficulty].quality / (task.parts || 1));
    } else if (task.kind === 'update') {
      core.applyUpdate(s, app, task, out);
    }
    s.stats.tasksDone += 1;
    out.push({ type: 'taskDone', appId: app.id, taskId: task.id, agentId: agent ? agent.id : null, bug });
    if (core.isReleaseReady(app) && !app.readyNotified) {
      app.readyNotified = true;
      out.push({ type: 'appReady', appId: app.id });
    }
  };
})(window.Game = window.Game || {});
