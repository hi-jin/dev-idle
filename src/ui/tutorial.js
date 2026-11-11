// The first-run tutorial (2026-11-11): one short card at a time, each tied to
// what the player has just done. Steps with `done` move on by themselves;
// the others wait for a button. `when` holds a step back until the game
// gets there (Accept All opens at stage 3, selling at a $1M valuation).
// Every step points at the thing it is about: a ring around it and a small
// "here" flag that follows it on the screen (2026-11-12).
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const B = G.balance;
  const S = G.strings;

  const ready = (s) => s.apps.some((a) => core.isReleaseReady(a));
  const one = (selector) => document.querySelector(selector);
  // On the right tab the thing itself; otherwise the tab that leads to it.
  const onTab = (tab, selector) => (ui.view.tab === tab ? one(selector) : null) || one(`[data-act="tab"][data-tab="${tab}"]`);

  const STEPS = [
    { key: 'type', done: (s) => s.stats.keys >= 15 || s.stage >= 2, target: () => one('#scene') },
    { key: 'build', done: (s) => ready(s) || s.stage >= 2, target: () => one('#current .bar.big') },
    { key: 'release', done: (s) => s.stage >= 2, target: () => one('[data-act="release"]') },
    { key: 'hire', done: (s) => s.agents.length > 0 || s.stage >= 3, target: () => onTab('agents', '[data-act="buyAgent"]') },
    { key: 'boost', target: () => one('.meter.boost') },
    { key: 'chart', target: () => one('#chart .chart-svg') },
    // a choice the card itself offers: turn it on, or leave it
    { key: 'acceptAll', when: (s) => s.stage >= B.acceptAll.stage, target: () => one('[data-act="acceptAll"]'), choice: true },
    { key: 'sell', when: (s) => !core.canExit(s), target: () => onTab('company', '[data-act="exit"]') },
  ];

  let flag = null; // the "here" flag
  let shown = -1; // the step the page last scrolled to

  function place(el) {
    if (!flag) {
      flag = document.createElement('div');
      flag.className = 'tut-flag';
      document.body.appendChild(flag);
    }
    const r = el.getBoundingClientRect();
    // above the thing, or under it when there is no room above
    const under = r.top < 46;
    flag.textContent = S.tutorialHere;
    flag.classList.toggle('under', under);
    flag.style.left = Math.max(40, Math.min(window.innerWidth - 40, r.left + Math.min(r.width / 2, 120))) + window.scrollX + 'px';
    flag.style.top = (under ? r.bottom + 10 : r.top - 10) + window.scrollY + 'px';
    flag.hidden = false;
  }

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
      let buttons = '';
      if (step.choice) {
        buttons =
          `<button class="primary" data-act="tutorialChoice" data-choice="on">${S.tutorialTurnOn}</button>` +
          `<button data-act="tutorialChoice" data-choice="off">${S.tutorialLeaveOff}</button>`;
      } else if (!step.done) {
        buttons = `<button class="primary" data-act="tutorialOk">${S.tutorialOk}</button>`;
      }
      return (
        `<div class="tutorial"><small>${S.tutorialStep(n, STEPS.length)}</small><p>${ui.esc(text)}</p>` +
        `<div class="tut-acts">${buttons}<button class="link" data-act="tutorialSkip">${S.tutorialSkip}</button></div></div>`
      );
    },

    // Rings the thing the step is about and keeps the flag on it. When a step
    // starts, the page scrolls so that the thing is in view.
    mark(s) {
      const step = ui.tutorial.current(s);
      const busy = !!document.querySelector('dialog[open]');
      const want = step && step.target && !busy ? step.target() : null;
      for (const el of document.querySelectorAll('.tut-target')) if (el !== want) el.classList.remove('tut-target');
      if (!want) {
        if (flag) flag.hidden = true;
        if (!step) shown = -1;
        return;
      }
      want.classList.add('tut-target');
      if (shown !== s.tutorial.step) {
        shown = s.tutorial.step;
        const r = want.getBoundingClientRect();
        if ((r.top < 60 || r.bottom > window.innerHeight - 20) && want.scrollIntoView) want.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      place(want);
    },
  };
})(window.Game = window.Game || {});
