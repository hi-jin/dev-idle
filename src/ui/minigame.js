// The compacting minigame (FR-13): a dot sweeps a bar three times and the
// player stops it inside the marked zone. The zone's place is random each
// round; that randomness is cosmetic, so it lives here and not in the core.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const B = G.balance;
  const S = G.strings;

  ui.Minigame = function (root, app) {
    this.root = root;
    this.app = app;
    this.active = false;
  };

  ui.Minigame.prototype.open = function (agentId) {
    const s = this.app.state;
    const agent = core.findAgent(s, agentId);
    if (this.active || !core.canCompress(s, agent)) return false;
    const M = B.minigame;
    const grow = Math.pow(M.templateGrowth, s.upgrades.template) * (1 + core.bonus(s, 'compactZone'));
    this.agentId = agentId;
    this.period = (M.periodByStage[s.stage] || 1.4) * 1000;
    this.perfect = M.perfect * grow;
    this.good = M.good * grow;
    this.scores = [];
    this.active = true;
    this.el = document.createElement('div');
    this.el.className = 'mg';
    this.el.innerHTML =
      `<div class="mg-card"><b>${ui.esc(S.mgTitle)}</b><small>${ui.esc(S.mgFor(ui.agentLabel(s, agent), ui.pct(core.contextRatio(agent))))}</small>` +
      '<p class="mg-round" data-m="round"></p>' +
      '<div class="mg-bar" data-m="bar"><i class="good" data-m="good"></i><i class="perfect" data-m="perfect"></i><span class="dot" data-m="dot"></span></div>' +
      `<div class="mg-results">${S.mgRounds.map((r) => `<span data-m="r">${ui.esc(r)}</span>`).join('')}</div>` +
      `<small class="mg-help" data-m="help">${ui.esc(S.mgHelp)}</small></div>`;
    this.parts = {};
    this.results = [...this.el.querySelectorAll('[data-m="r"]')];
    for (const el of this.el.querySelectorAll('[data-m]')) this.parts[el.dataset.m] = el;
    this.root.appendChild(this.el);
    // no new event while the game is up, and a bug on the desk waits for it
    this.app.act({ type: 'hold', seconds: 12 });
    this.startRound();
    const loop = (t) => {
      if (!this.active) return;
      this.draw(t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    return true;
  };

  ui.Minigame.prototype.startRound = function () {
    const i = this.scores.length;
    this.center = 0.25 + Math.random() * 0.5;
    this.roundStart = performance.now();
    this.locked = false;
    this.parts.round.textContent = S.mgRound(i + 1, B.minigame.rounds, S.mgRounds[i]);
    const zone = (el, half) => {
      el.style.left = Math.max(0, this.center - half) * 100 + '%';
      el.style.width = (Math.min(1, this.center + half) - Math.max(0, this.center - half)) * 100 + '%';
    };
    zone(this.parts.good, this.good);
    zone(this.parts.perfect, this.perfect);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.press(true), B.minigame.roundTimeoutSeconds * 1000);
  };

  // A triangle wave from 0 to 1 and back over one period.
  ui.Minigame.prototype.position = function (t) {
    const phase = ((t - this.roundStart) % this.period) / this.period;
    return phase < 0.5 ? phase * 2 : 2 - phase * 2;
  };

  ui.Minigame.prototype.draw = function (t) {
    if (this.locked) return;
    this.pos = this.position(t);
    this.parts.dot.style.left = this.pos * 100 + '%';
  };

  ui.Minigame.prototype.press = function (timedOut) {
    if (!this.active || this.locked) return;
    this.locked = true;
    clearTimeout(this.timer);
    const M = B.minigame.scores;
    const d = Math.abs(this.position(performance.now()) - this.center);
    let score = M.miss;
    if (!timedOut && d <= this.perfect) score = M.perfect;
    else if (!timedOut && d <= this.good) score = M.good;
    const label = score === M.perfect ? S.mgPerfect : score === M.good ? S.mgGood : S.mgMiss;
    const cell = this.results[this.scores.length];
    cell.textContent = label;
    cell.className = score === M.perfect ? 'perfect' : score === M.good ? 'good' : 'miss';
    this.scores.push(score);
    if (this.scores.length < B.minigame.rounds) {
      setTimeout(() => this.startRound(), 550);
      return;
    }
    const quality = this.scores.reduce((a, b) => a + b, 0) / this.scores.length;
    this.app.act({ type: 'compress', agentId: this.agentId, scores: this.scores });
    this.parts.help.textContent = S.mgDone(ui.pct(quality), ui.num(Math.round(core.focusFor(this.app.state, quality) * 10) / 10));
    setTimeout(() => this.close(), 1100);
  };

  ui.Minigame.prototype.close = function () {
    this.active = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.timer);
    if (this.el) this.el.remove();
    this.el = null;
  };
})(window.Game = window.Game || {});
