// One tick of game time, and the single entry point for player actions (spec 3.1, 3.2).
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});

  // opts.idle: the player is away (offline progress), so agents work at half
  // speed and no event asks for a choice.
  core.tick = function (s, dt, opts) {
    const idle = !!(opts && opts.idle);
    const out = [];
    s.clock.runSeconds += dt;
    s.clock.totalSeconds += dt;
    core.tickFever(s, out);
    core.tickAgents(s, dt, out, idle);
    core.tickMarket(s, dt, out);
    core.tickQuality(s, dt, out);
    core.tickSocial(s, dt, out);
    core.tickEvents(s, dt, out, idle);
    core.checkStage(s, out);
    core.logAction(s, null, false, out);
    core.tickLog(s, dt);
    return out;
  };

  // What every accepted key also does: open-source events count it, and
  // during an outage it fights the fire.
  core.typed = function (s, out) {
    core.eventTyped(s, out);
    core.fightOutage(s, out);
  };

  core.act = function (s, a) {
    const out = [];
    let ok = false;
    switch (a.type) {
      case 'key':
        ok = core.pressKey(s, a.code, out, a.shift);
        if (ok) core.typed(s, out);
        break;
      case 'tap':
        ok = core.tap(s, out);
        if (ok) core.typed(s, out);
        break;
      case 'pick':
        ok = core.pickChunk(s, a.index, out);
        if (ok) core.typed(s, out);
        break;
      case 'setTypingTask':
        ok = core.setTypingTask(s, a.taskId);
        break;
      case 'buyAgent':
        ok = core.buyAgent(s, a.kind, out);
        break;
      case 'release':
        ok = core.releaseApp(s, a.appId, out);
        break;
      // the tutorial moves on (never back), or is skipped for good
      case 'tutorial':
        if (a.skip) s.tutorial.done = true;
        else if (Number.isInteger(a.step) && a.step > s.tutorial.step) s.tutorial.step = a.step;
        ok = true;
        break;
      case 'fireAgent':
        ok = core.fireAgent(s, a.agentId, a.kind, out);
        break;
      // the player is busy with something on screen (the compacting game):
      // no new event for a while, and a bug on the desk waits
      case 'hold':
        ok = core.holdEvents(s, a.seconds);
        break;
      case 'buyUpgrade':
        ok = core.buyUpgrade(s, a.key, out);
        break;
      case 'drink':
        ok = core.drink(s, out);
        break;
      case 'acceptAll':
        ok = core.setAcceptAll(s, a.on);
        break;
      case 'autoCompress':
        ok = core.setAutoCompress(s, a.on);
        break;
      case 'compress':
        ok = core.compressManually(s, a.agentId, a.scores, out);
        break;
      case 'postAchievement':
        ok = core.postAchievement(s, a.id, out);
        break;
      case 'exit':
        ok = core.exitCompany(s, out);
        break;
      case 'event':
        ok = core.answerEvent(s, a.choice, out);
        break;
      case 'review':
        ok = core.answerReview(s, a.choice, out);
        break;
      case 'feverKind':
        ok = core.setFeverKind(s, a.kind);
        break;
      case 'demo':
        ok = s.demo && core.demoAction(s, a, out);
        break;
      default:
        break;
    }
    core.checkStage(s, out);
    core.checkAchievements(s, out);
    // the mark of the player's own choice, for the growth chart
    const mark = core.logAction(s, a, ok, out);
    return { ok, out, mark };
  };
})(window.Game = window.Game || {});
