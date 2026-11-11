// Demo tools for the presentation (FR-28, spec 10.2). They only run when the
// game was opened with ?demo=1, and they change the state through the same
// functions as normal play.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});

  // Finishes and releases the app being built, stage after stage, and leaves
  // some money to spend.
  function jumpToStage(s, stage, out) {
    if (stage <= s.stage || stage > 5) return false;
    while (s.stage < stage) {
      const app = s.apps.find((a) => a.status === 'building');
      if (!app) break;
      for (const task of app.tasks.slice()) if (!task.done) core.finishTask(s, app, task, null, out);
      core.releaseApp(s, app.id, out);
      app.users = core.userTarget(s, app);
      core.checkStage(s, out);
    }
    return s.stage >= stage;
  }

  core.demoAction = function (s, a, out) {
    switch (a.action) {
      case 'stage':
        return jumpToStage(s, a.stage, out);
      case 'money':
        s.money += a.amount > 0 ? a.amount : Math.max(1000, core.steadyRevenue(s) * 3);
        return true;
      case 'outage':
        if (core.inOutage(s) || !s.apps.some((x) => x.status === 'live')) return false;
        return core.startOutage(s, out);
      case 'event': {
        if (s.events.current) return false;
        s.events.readyAt = 0;
        return core.startEvent(s, a.kind, out);
      }
      case 'fever': {
        if (core.feverActive(s) || !core.feverUnlocked(s, a.kind)) return false;
        core.startFever(s, out, a.kind);
        return true;
      }
      case 'skip': {
        const summary = core.runOffline(s, a.seconds);
        out.push({ type: 'offline', summary });
        return true;
      }
      default:
        return false;
    }
  };
})(window.Game = window.Game || {});
