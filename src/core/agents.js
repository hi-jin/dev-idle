// Hiring agents, the work they pick, context and compacting, and agent work
// each tick (FR-08, FR-12, FR-13).
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  core.findAgent = function (s, id) {
    return s.agents.find((a) => a.id === id) || null;
  };

  core.agentCount = function (s, kind) {
    return s.agents.filter((a) => a.kind === kind).length;
  };

  core.agentPrice = function (s, kind) {
    return B.agents[kind].price * Math.pow(B.agentPriceGrowth, core.agentCount(s, kind));
  };

  core.agentSlots = function (s) {
    return B.agentSlots[s.stage] || 0;
  };

  // "Bulk Agent #2": numbered within its kind in hiring order.
  core.agentLabel = function (s, agent) {
    const same = s.agents.filter((a) => a.kind === agent.kind);
    const name = G.content.agents[agent.kind].name;
    return same.length > 1 ? name + ' #' + (same.indexOf(agent) + 1) : name;
  };

  // Returns null when allowed, otherwise the reason.
  core.canBuyAgent = function (s, kind) {
    const cfg = B.agents[kind];
    if (!cfg) return 'unknown';
    if (cfg.stage > s.stage) return 'locked';
    if (s.agents.length >= core.agentSlots(s)) return 'slots';
    if (s.money < core.agentPrice(s, kind)) return 'money';
    return null;
  };

  core.buyAgent = function (s, kind, out) {
    if (core.canBuyAgent(s, kind)) return false;
    s.money -= core.agentPrice(s, kind);
    const agent = { id: core.newId(s, 'g'), kind, taskIds: [], appId: null, failStreak: 0, done: 0, failed: 0, context: 0, full: false, focus: 1, focusUntil: 0 };
    s.agents.push(agent);
    core.fillAgent(s, agent);
    out.push({ type: 'hired', agentId: agent.id });
    return true;
  };

  // What letting an agent go pays back: part of what the last one of its kind cost.
  core.agentRefund = function (s, kind) {
    const n = core.agentCount(s, kind);
    return n ? B.agents[kind].price * Math.pow(B.agentPriceGrowth, n - 1) * B.agentRefund : 0;
  };

  // Frees a desk. `kind` is used when the id is not there (a what-if replay
  // in which the agents got other ids).
  core.fireAgent = function (s, agentId, kind, out) {
    const agent = core.findAgent(s, agentId) || (kind ? s.agents.slice().reverse().find((a) => a.kind === kind) : null);
    if (!agent) return false;
    for (const id of agent.taskIds.slice()) {
      const f = core.findTask(s, id);
      if (f) f.task.assignee = null;
    }
    s.money += core.agentRefund(s, agent.kind);
    s.agents = s.agents.filter((a) => a !== agent);
    core.fillAll(s);
    out.push({ type: 'dismissed', kind: agent.kind });
    return true;
  };

  core.unassignTask = function (s, task) {
    const agent = core.findAgent(s, task.assignee);
    if (agent) agent.taskIds = agent.taskIds.filter((id) => id !== task.id);
    task.assignee = null;
  };

  // Agents pick their own work: the hardest open task they succeed at often
  // enough, else the easiest. They prefer their current app and leave the
  // task the player is typing until nothing else is left.
  core.pickTaskFor = function (s, agent) {
    const minChance = B.assignment.minChance;
    let best = null;
    let bestScore = -Infinity;
    for (const app of s.apps) {
      for (const task of app.tasks) {
        if (task.done || task.assignee) continue;
        const p = core.successChance(s, agent, task.difficulty);
        let score = p >= minChance ? 10 + task.difficulty : -task.difficulty;
        if (app.status === 'building') score += 1;
        if (app.id === agent.appId) score += 0.5;
        if (task.id === s.typing.taskId) score -= 100;
        if (score > bestScore) {
          best = task;
          bestScore = score;
        }
      }
    }
    return best;
  };

  // Lines a second this kind of agent really gets done on a task of this
  // difficulty, once its expected failures are counted.
  core.effectiveRate = function (s, kind, difficulty) {
    return core.agentBaseSpeed(s, kind) * core.expectedYield(s, { kind }, difficulty);
  };

  // A free agent with nothing open takes over a task of the app being built
  // from an agent that is clearly worse at it (2026-11-11). So a strong new
  // hire helps the current app at once, instead of waiting for the next one.
  core.takeOverFor = function (s, agent) {
    const need = B.assignment.takeOver;
    let best = null;
    let bestGain = need;
    for (const app of s.apps) {
      if (app.status !== 'building') continue;
      for (const task of app.tasks) {
        if (task.done || !task.assignee || task.assignee === agent.id) continue;
        const holder = core.findAgent(s, task.assignee);
        if (!holder) continue;
        const gain = core.effectiveRate(s, agent.kind, task.difficulty) / core.effectiveRate(s, holder.kind, task.difficulty);
        if (gain > bestGain) {
          best = task;
          bestGain = gain;
        }
      }
    }
    if (best) core.unassignTask(s, best);
    return best;
  };

  // With nothing left to build, a free agent takes over a task it is much
  // better at, or starts an update for a live app.
  core.fillAgent = function (s, agent) {
    const cap = B.agents[agent.kind].concurrency;
    while (agent.taskIds.length < cap) {
      let task = core.pickTaskFor(s, agent);
      if (!task) task = core.takeOverFor(s, agent);
      if (!task && core.planAnyUpdate(s)) task = core.pickTaskFor(s, agent);
      if (!task) break;
      task.assignee = agent.id;
      agent.taskIds.push(task.id);
      agent.appId = task.appId;
    }
  };

  core.fillAll = function (s) {
    for (const agent of s.agents) core.fillAgent(s, agent);
  };

  // ---------- context and compacting ----------

  core.autoCompressOn = function (s) {
    return s.upgrades.autoCompress >= 0 && s.upgrades.autoCompressOn;
  };

  core.focusActive = function (s, agent) {
    return agent.focusUntil > s.clock.totalSeconds;
  };

  // The speed boost a summary of this quality (0 to 1) starts.
  core.focusFor = function (s, quality) {
    const C = B.context;
    return C.focusMin + (C.focusMax - C.focusMin) * Math.max(0, Math.min(1, quality)) + C.focusPerTemplate * s.upgrades.template;
  };

  // Empties the agent's context. A summary written by hand also starts a
  // focus boost; auto-compacting only empties.
  core.compress = function (s, agent, quality, out, auto) {
    if (!B.agents[agent.kind].context) return false;
    agent.context = 0;
    agent.full = false;
    if (!auto) {
      agent.focus = core.focusFor(s, quality);
      agent.focusUntil = s.clock.totalSeconds + B.context.focusSeconds;
    }
    s.stats.compacts += 1;
    out.push({ type: 'compressed', agentId: agent.id, quality, auto: !!auto, focus: auto ? 1 : agent.focus });
    return true;
  };

  core.canCompress = function (s, agent) {
    return !!agent && B.agents[agent.kind].context > 0 && core.contextRatio(agent) >= B.context.manualFrom;
  };

  // The minigame's three round scores, each perfect / good / miss.
  core.compressManually = function (s, agentId, scores, out) {
    const agent = core.findAgent(s, agentId);
    const M = B.minigame;
    const allowed = Object.values(M.scores);
    if (!core.canCompress(s, agent)) return false;
    if (!Array.isArray(scores) || scores.length !== M.rounds || !scores.every((x) => allowed.includes(x))) return false;
    const quality = scores.reduce((a, b) => a + b, 0) / scores.length;
    if (scores.every((x) => x === M.scores.perfect)) {
      s.stats.perfectCompacts += 1;
      s.stats.perfectStreak += 1;
    } else {
      s.stats.perfectStreak = 0;
    }
    return core.compress(s, agent, quality, out, false);
  };

  // ---------- work ----------

  // How much typing heat speeds agents up right now (1 to 2).
  core.heatBoost = function (s) {
    return 1 + (B.heat.agentBoost * s.typing.heat) / B.heat.max;
  };

  // Lines a second for an agent of this kind before heat, focus or a full context.
  core.agentBaseSpeed = function (s, kind) {
    let speed = B.agents[kind].speed * Math.pow(B.promptSpeed, s.dev.prompt);
    if (kind === 'local') speed *= 1 + (s.upgrades.localGear || 0);
    if (s.acceptAll.on) speed *= B.acceptAll.speed * (1 + core.bonus(s, 'acceptAllSpeed'));
    return speed;
  };

  // Lines a second on each of the agent's tasks.
  core.agentSpeed = function (s, agent, idle) {
    let speed = core.agentBaseSpeed(s, agent.kind);
    if (agent.full) speed *= B.context.slow;
    if (core.focusActive(s, agent)) speed *= agent.focus;
    if (idle) speed *= agent.kind === 'local' ? 1 : B.offline.agentSpeed;
    else speed *= core.heatBoost(s);
    return speed;
  };

  core.tickAgents = function (s, dt, out, idle) {
    const H = B.heat;
    s.typing.heat = Math.max(0, s.typing.heat - H.decayPerSecond * dt);
    // everyone is busy putting the fire out
    if (core.inOutage(s)) return;
    for (const agent of s.agents) {
      const cap = B.agents[agent.kind].context;
      if (cap && agent.context >= cap) {
        if (core.autoCompressOn(s)) {
          core.compress(s, agent, 0, out, true);
        } else if (!agent.full) {
          agent.full = true;
          out.push({ type: 'contextFull', agentId: agent.id });
        }
      }
      if (agent.taskIds.length < B.agents[agent.kind].concurrency) core.fillAgent(s, agent);
      const lines = core.agentSpeed(s, agent, idle) * dt;
      for (const id of agent.taskIds.slice()) {
        const f = core.findTask(s, id);
        if (!f) {
          agent.taskIds = agent.taskIds.filter((x) => x !== id);
          continue;
        }
        if (cap) agent.context = Math.min(cap, agent.context + lines);
        core.addProgress(s, f.app, f.task, lines, agent, out);
      }
    }
  };
})(window.Game = window.Game || {});
