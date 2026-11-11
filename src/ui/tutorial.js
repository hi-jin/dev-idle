// The first-run tutorial (2026-11-11): one short card at a time, each tied to
// what the player has just done. Steps with `done` move on by themselves;
// the others wait for the OK button. `when` holds a step back until the game
// gets there (Accept All opens at stage 3, selling at a $1M valuation).
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const B = G.balance;
  const S = G.strings;

  const ready = (s) => s.apps.some((a) => core.isReleaseReady(a));

  const STEPS = [
    { key: 'type', done: (s) => s.stats.keys >= 15 || s.stage >= 2 },
    { key: 'build', done: (s) => ready(s) || s.stage >= 2 },
    { key: 'release', done: (s) => s.stage >= 2, target: '[data-act="release"]' },
    { key: 'hire', done: (s) => s.agents.length > 0 || s.stage >= 3, target: '[data-act="buyAgent"]', tab: 'agents' },
    { key: 'boost', target: '.meter.boost' },
    { key: 'chart', target: '#chart' },
    { key: 'acceptAll', when: (s) => s.stage >= B.acceptAll.stage, target: '[data-act="acceptAll"]' },
    { key: 'sell', when: (s) => !core.canExit(s), target: '[data-act="tab"][data-tab="company"]' },
  ];

  ui.tutorial = {
    steps: STEPS,

    // The step to show now, or null (finished, skipped, or waiting for the game).
    current(s) {
      const t = s.tutorial;
      if (!t || t.done || t.step >= STEPS.length) return null;
      const step = STEPS[t.step];
      return step.when && !step.when(s) ? null : step;
    },

    // Moves past the steps the player has already done. Returns the action
    // to send, or null when nothing changes.
    advance(s) {
      const t = s.tutorial;
      if (!t || t.done) return null;
      // someone who has sold a company before does not need it again
      if (t.step === 0 && s.prestige.exits > 0) return { type: 'tutorial', skip: true };
      let step = t.step;
      while (step < STEPS.length && STEPS[step].done && STEPS[step].done(s)) step += 1;
      if (step >= STEPS.length) return { type: 'tutorial', skip: true };
      return step > t.step ? { type: 'tutorial', step } : null;
    },

    structure(s) {
      const step = ui.tutorial.current(s);
      if (!step) return '';
      const n = s.tutorial.step + 1;
      const text = ui.view.touch && S.tutorial[step.key + 'Touch'] ? S.tutorial[step.key + 'Touch'] : S.tutorial[step.key];
      const ok = step.done ? '' : `<button class="primary" data-act="tutorialOk">${S.tutorialOk}</button>`;
      return (
        `<div class="tutorial"><small>${S.tutorialStep(n, STEPS.length)}</small><p>${ui.esc(text)}</p>` +
        `<div class="tut-acts">${ok}<button class="link" data-act="tutorialSkip">${S.tutorialSkip}</button></div></div>`
      );
    },

    // Rings the thing the step is about.
    mark(s) {
      const step = ui.tutorial.current(s);
      const want = step && step.target ? document.querySelector(step.target) : null;
      for (const el of document.querySelectorAll('.tut-target')) if (el !== want) el.classList.remove('tut-target');
      if (want) want.classList.add('tut-target');
    },
  };
})(window.Game = window.Game || {});
