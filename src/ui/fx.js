// Sounds and on-screen effects for what happens in the game: confetti and a
// banner for big moments, a shake for outages, a ring for each right answer.
// Effects with motion are skipped when the system asks for reduced motion.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const S = G.strings;

  const COLORS = ['#7F77DD', '#D4537E', '#EF9F27', '#1D9E75', '#378ADD', '#FAC775'];
  const PURCHASES = { buyAgent: 'hire', buyUpgrade: 'buy', postAchievement: 'pop', fireAgent: 'pop' };

  function reducedMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  }

  const byId = (id) => document.getElementById(id);

  // Adds a class for ms milliseconds, restarting its animation if it is already on.
  function pulse(el, cls, ms) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(el['fx' + cls]);
    el['fx' + cls] = setTimeout(() => el.classList.remove(cls), ms || 600);
  }

  function confetti(n) {
    const root = byId('scene');
    if (!root || reducedMotion()) return;
    const layer = document.createElement('div');
    layer.className = 'confetti';
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = COLORS[i % COLORS.length];
      p.style.setProperty('--dx', (Math.random() * 2 - 1) * 50 + 'px');
      p.style.setProperty('--spin', Math.round(Math.random() * 900 - 450) + 'deg');
      p.style.animationDelay = (Math.random() * 0.3).toFixed(2) + 's';
      p.style.animationDuration = (1.2 + Math.random() * 0.8).toFixed(2) + 's';
      layer.appendChild(p);
    }
    root.appendChild(layer);
    setTimeout(() => layer.remove(), 2600);
  }

  // A big title across the scene for a moment.
  function banner(title, sub) {
    const root = byId('scene');
    if (!root) return;
    for (const old of root.querySelectorAll('.fx-banner')) old.remove();
    const el = document.createElement('div');
    el.className = 'fx-banner';
    el.innerHTML = `<b>${ui.esc(title)}</b>` + (sub ? `<small>${ui.esc(sub)}</small>` : '');
    root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  function companyTab() {
    return document.querySelector('[data-act="tab"][data-tab="company"]');
  }

  ui.fx = {
    pulse,

    // Notes from core.tick and core.act.
    notes(s, notes) {
      const play = ui.sound.play;
      for (const n of notes) {
        switch (n.type) {
          case 'stage':
            play('stage');
            confetti(70);
            banner(S.fxStage(n.stage), S.stageTitles[n.stage]);
            pulse(byId('hud'), 'fx-bump', 700);
            break;
          case 'released':
            play('release');
            confetti(36);
            break;
          case 'achievement':
            play('achievement');
            pulse(companyTab(), 'fx-glow', 1600);
            break;
          case 'league':
            play('stage');
            confetti(70);
            banner(S.fxLeague(S.leagues[n.league]), ui.money(n.cash));
            break;
          case 'exit':
            play('sale');
            confetti(110);
            break;
          case 'feverStart':
            play('feverStart');
            pulse(byId('scene'), 'fx-flash', 700);
            break;
          case 'feverEnd':
            play('feverEnd');
            break;
          case 'outage':
            play('outage');
            if (!reducedMotion()) pulse(byId('scene'), 'fx-shake', 500);
            break;
          case 'outageEnd':
            play(n.byPlayer ? 'release' : 'feverEnd');
            if (n.byPlayer) confetti(24);
            break;
          case 'eventEnd':
            if (n.kind === 'hallucination') play(n.squashed ? 'right' : 'wrong');
            break;
          case 'promptDone':
            play('right');
            break;
          case 'reviewed':
            play(n.right ? 'right' : 'wrong');
            if (!n.right && !reducedMotion()) pulse(document.querySelector('#caffeine .review'), 'fx-shake', 450);
            break;
          case 'event':
            play('pop');
            break;
          case 'compressed':
            if (!n.auto) play(n.quality >= 0.95 ? 'right' : 'pop');
            break;
          default:
            break;
        }
      }
    },

    // The player's own action. `before` is what caffeine mode looked like just before it.
    action(s, action, result, before) {
      const play = ui.sound.play;
      if (action.type === 'key' || action.type === 'tap' || action.type === 'pick') {
        if (s.stats.keys === before.keys) return;
        const f = s.caffeine.fever;
        if (before.kind === 'typing' && f) play(f.wrong > before.wrong ? 'miss' : 'streak', f.combo);
        else if (before.kind === 'prompt' && f) play(f.wrong > before.wrong ? 'miss' : 'key');
        else if (!before.kind) play('key');
        return;
      }
      if (result.ok && PURCHASES[action.type]) {
        play(PURCHASES[action.type]);
        pulse(document.querySelector('.money'), 'fx-spend', 400);
      }
    },
  };
})(window.Game = window.Game || {});
