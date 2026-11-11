// Random events (FR-23, spec 6.14). One event at a time from stage 2; a new one
// can start a while after the last one ends. Events that need the player wait a
// short time and then take their default, and never start while the player is away.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  core.EVENT_KINDS = ['hallucination', 'viral', 'investor', 'oss'];
  const NEEDS_PLAYER = { hallucination: true, investor: true, oss: true };

  function viralTargets(s) {
    return s.apps.filter((a) => a.status === 'live');
  }

  core.eventPossible = function (s, kind, idle) {
    if (idle && NEEDS_PLAYER[kind]) return false;
    if (core.inOutage(s)) return false;
    switch (kind) {
      case 'hallucination': return s.agents.length > 0;
      case 'viral': return viralTargets(s).length > 0;
      case 'investor': return core.steadyRevenue(s) > 0 && s.investor.dilution < B.events.investor.maxDilution;
      case 'oss': return true;
      default: return false;
    }
  };

  function finish(s, result, out) {
    const ev = s.events.current;
    s.events.current = null;
    s.events.readyAt = s.clock.runSeconds + B.events.cooldownSeconds;
    out.push(Object.assign({ type: 'eventEnd', kind: ev.kind, appId: ev.appId }, result));
  }

  function addFollowers(s, share, min) {
    const n = Math.round(Math.max(min, s.social.followers * share));
    s.social.followers += n;
    return n;
  }

  // Starts an event now, if it can happen. Returns true when it started.
  core.startEvent = function (s, kind, out, idle) {
    const E = B.events;
    if (s.events.current || !core.eventPossible(s, kind, idle)) return false;
    const now = s.clock.runSeconds;
    s.stats.events = (s.stats.events || 0) + 1;

    const ev = { kind, at: now, until: now + E.choiceSeconds };
    if (kind === 'hallucination') {
      // An agent imported a library that does not exist; the bug crawls over
      // the desk until the player squashes it. x and y place it (percent).
      const agent = G.rng.pick(s, s.agents);
      ev.agentId = agent.id;
      ev.until = now + E.bug.seconds;
      ev.x = 12 + Math.floor(G.rng.next(s) * 70);
      ev.y = 20 + Math.floor(G.rng.next(s) * 45);
      ev.cash = Math.max(E.bug.minCash, (core.steadyRevenue(s) / 60) * E.bug.revenueSeconds);
    } else if (kind === 'viral') {
      const app = G.rng.pick(s, viralTargets(s));
      ev.appId = app.id;
      ev.until = now + E.viral.seconds;
    } else if (kind === 'investor') {
      const I = E.investor;
      ev.npc = G.rng.pick(s, G.content.npcs).id;
      ev.cash = core.steadyRevenue(s) * I.revenueMinutes;
      ev.followers = Math.round(Math.max(I.declineMin, s.social.followers * I.declineShare));
    } else if (kind === 'oss') {
      ev.keys = 0;
      ev.goal = E.oss.keys;
    }
    s.events.current = ev;
    out.push({ type: 'event', kind, appId: ev.appId, agentId: ev.agentId });
    return true;
  };

  // The player's answer: accept / decline for an investor, squash for a bug.
  core.answerEvent = function (s, choice, out) {
    const ev = s.events.current;
    if (!ev) return false;
    if (ev.kind === 'hallucination') {
      if (choice !== 'squash') return false;
      s.money += ev.cash;
      s.stats.bugsSquashed += 1;
      finish(s, { squashed: true, cash: ev.cash }, out);
      return true;
    }
    if (ev.kind !== 'investor') return false;
    if (choice === 'accept') {
      const I = B.events.investor;
      s.money += ev.cash;
      s.investor.dilution = Math.min(I.maxDilution, s.investor.dilution + I.dilution);
      finish(s, { choice, cash: ev.cash }, out);
    } else {
      s.social.followers += ev.followers;
      finish(s, { choice: 'decline', followers: ev.followers }, out);
    }
    return true;
  };

  // Every key the player types counts toward an open-source contribution.
  core.eventTyped = function (s, out) {
    const ev = s.events.current;
    if (!ev || ev.kind !== 'oss') return;
    ev.keys += 1;
    if (ev.keys < ev.goal) return;
    const n = addFollowers(s, B.events.oss.share, B.events.oss.min);
    finish(s, { done: true, followers: n }, out);
  };

  core.holdEvents = function (s, seconds) {
    const n = Math.max(0, Math.min(30, Number(seconds) || 0));
    const ev = s.events.current;
    s.events.readyAt = Math.max(s.events.readyAt, s.clock.runSeconds + n);
    if (ev && ev.kind === 'hallucination') ev.until += n;
    return true;
  };

  core.viralApp = function (s, app) {
    const ev = s.events.current;
    return !!ev && ev.kind === 'viral' && ev.appId === app.id;
  };

  core.tickEvents = function (s, dt, out, idle) {
    const E = B.events;
    const ev = s.events.current;
    const now = s.clock.runSeconds;
    if (ev) {
      if (ev.kind === 'viral' && !core.findApp(s, ev.appId)) finish(s, {}, out);
      else if (now >= ev.until) {
        if (ev.kind === 'investor') core.answerEvent(s, 'decline', out);
        else if (ev.kind === 'hallucination') {
          // a bug nobody squashed ships
          finish(s, { squashed: false }, out);
          core.addBugs(s, E.bug.missBugs, out);
        } else finish(s, ev.kind === 'oss' ? { done: false } : {}, out);
      }
      return;
    }
    if (s.stage < E.stage || now < s.events.readyAt || !E.perMinute) return;
    if (G.rng.next(s) >= core.perTick(E.perMinute, dt)) return;
    const kinds = core.EVENT_KINDS.filter((k) => core.eventPossible(s, k, idle));
    if (!kinds.length) return;
    core.startEvent(s, G.rng.weighted(s, kinds, (k) => E.weights[k]), out, idle);
  };
})(window.Game = window.Game || {});
