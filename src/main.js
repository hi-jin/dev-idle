// Boot, game loop, rendering and saving. Demo mode: ?demo=1&speed=10&seed=42 (FR-28).
(function (G) {
  'use strict';
  const core = G.core;
  const ui = G.ui;
  const S = G.strings;
  const B = G.balance;

  const params = new URLSearchParams(window.location.search);
  const demo = params.get('demo') === '1';
  let speed = demo ? Math.max(1, Math.min(50, Number(params.get('speed')) || 1)) : 1;
  const seedParam = params.get('seed');

  const storage = (function () {
    try {
      const k = '__devidle_probe';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return window.localStorage;
    } catch (e) {
      return null;
    }
  })();

  function newState() {
    return core.createState({ seed: seedParam != null ? Number(seedParam) : Date.now(), demo });
  }

  // A fixed seed means "start this exact game", so it ignores any saved demo.
  const loaded = storage && seedParam == null ? G.save.load(storage, demo) : null;
  let state = loaded ? loaded.state : newState();

  // Time away is played out before the first frame (FR-27).
  const awaySeconds = loaded ? core.awaySeconds(loaded.savedAt, Date.now()) : 0;
  const away = awaySeconds >= B.offline.minSeconds ? core.runOffline(state, awaySeconds) : null;

  const panels = {};
  let scene = null;

  // A seeded game is a rehearsal: it never loads a save, so it never writes one either.
  function save() {
    if (storage && seedParam == null) G.save.store(storage, state, Date.now());
  }

  function render() {
    panels.hud.update(state);
    panels.caffeine.update(state);
    panels.current.update(state);
    panels.tabs.update(state);
    panels.sheet.update(state);
    panels.caption.update(state);
    panels.event.update(state);
    panels.demo.update(state);
    // the tutorial moves on by itself when its step is done
    const next = ui.tutorial.advance(state);
    if (next) core.act(state, next);
    panels.tutorial.update(state);
    ui.tutorial.mark(state);
    scene.update(state);
    ui.timeline.work(state, 2);
    drawChart(false);
    // the choice window: its button follows the money
    if (choice) {
      const ok = document.querySelector('#choice [data-act="choiceOk"]');
      const why = choice.type === 'buyAgent' ? core.canBuyAgent(state, choice.kind) : choice.type === 'buyUpgrade' ? core.canBuyUpgrade(state, choice.key) : null;
      if (ok) ok.disabled = !!why;
    }
  }

  // The growth chart redraws once a second, or at once when what it shows changes.
  let chartAt = -Infinity;
  let chartHtml = '';
  function drawChart(now) {
    const t = performance.now();
    if (!now && t - chartAt < 1000) return;
    chartAt = t;
    const html = ui.chart.html(state);
    if (html === chartHtml) return;
    chartHtml = html;
    document.getElementById('chart').innerHTML = html;
  }

  // Text in index.html outside the panels: the title, labels, footer and the notice dialog.
  function applyStaticText() {
    for (const el of document.querySelectorAll('[data-text]')) if (S[el.dataset.text]) el.textContent = S[el.dataset.text];
    for (const el of document.querySelectorAll('[data-label]')) if (S[el.dataset.label]) el.setAttribute('aria-label', S[el.dataset.label]);
  }

  function showAway(summary) {
    document.getElementById('away-title').textContent = S.awayTitle;
    document.getElementById('away-close').textContent = S.awayClose;
    document.getElementById('away-body').innerHTML = ui.awayHtml(state, summary);
    const dialog = document.getElementById('away');
    if (dialog.showModal) dialog.showModal();
  }

  // The end of a run: the grade, the price, the time and what carries over.
  function showResult(n, analysis) {
    document.getElementById('result-body').innerHTML = ui.resultHtml(n, analysis);
    document.getElementById('result-close').textContent = S.resultAgain;
    const dialog = document.getElementById('result');
    if (dialog.showModal && !dialog.open) dialog.showModal();
    // the button at the bottom takes the focus; the grade at the top is what to see first
    dialog.scrollTop = 0;
  }

  // Notes from the core drive toasts and the scene's reactions.
  function handle(notes) {
    if (!notes.length) return;
    ui.notify(state, notes);
    ui.fx.notes(state, notes);
    for (const n of notes) {
      if (n.type === 'released' || n.type === 'stage' || n.type === 'outage' || n.type === 'outageEnd') ui.timeline.invalidate();
      if (n.type === 'taskFailed') scene.oops(n.agentId);
      else if (n.type === 'offline') showAway(n.summary);
      else if (n.type === 'exit') {
        showResult(n, exitAnalysis);
        ui.timeline.reset();
      }
      else if (n.type === 'released' && n.bonus > 0) scene.earned(n.bonus);
      else if (n.type === 'eventEnd' && n.squashed) scene.earned(n.cash);
      else if (n.type === 'promptDone') scene.float(S.toastPromptDone(ui.num(n.gain * 100)), 'lines', 40 + Math.random() * 14, 14);
      else if (n.type === 'reviewed' && n.cash > 0) scene.earned(n.cash);
    }
  }

  // The choice the window is asking about.
  let choice = null;

  // What the choices of the run did, worked out just before a sale resets it.
  let exitAnalysis = null;

  const app = {
    get speed() {
      return speed;
    },
    set speed(x) {
      speed = demo ? Math.max(1, Math.min(50, x)) : 1;
    },
    get state() {
      return state;
    },
    act(action) {
      const before = state.stats.keys;
      const fever = state.caffeine.fever;
      const was = { keys: before, kind: core.feverKind(state), wrong: fever ? fever.wrong : 0 };
      const snap = ui.timeline.before(state, action);
      if (action.type === 'exit' && !core.canExit(state)) exitAnalysis = ui.timeline.analyze(state);
      const result = core.act(state, action);
      ui.timeline.after(state, action, result, snap);
      ui.fx.action(state, action, result, was);
      handle(result.out);
      if (action.type === 'key' || action.type === 'tap' || action.type === 'pick') {
        if (state.stats.keys > before && state.typing.lastLines > 0) scene.typed(state.typing.lastLines);
        scene.update(state);
        if (result.out.length) render();
      } else {
        render();
      }
      return result;
    },
    // After a language switch: page text, the scene hint, then every panel.
    relabel() {
      applyStaticText();
      scene.relabel();
      render();
      drawChart(true);
    },
    // Before buying, hiring or letting go: a window with the chart of what
    // changes and why. The choice is made from its button.
    openChoice(action) {
      const dialog = document.getElementById('choice');
      if (!dialog.showModal) return app.act(action);
      choice = action;
      document.getElementById('choice-body').innerHTML = ui.choiceHtml(state, action, ui.timeline.outlook(state, action));
      if (!dialog.open) dialog.showModal();
      return null;
    },
    confirmChoice() {
      const dialog = document.getElementById('choice');
      const action = choice;
      choice = null;
      if (dialog.open) dialog.close();
      if (action) app.act(action);
    },
    closeChoice() {
      choice = null;
      const dialog = document.getElementById('choice');
      if (dialog.open) dialog.close();
    },
    // The chart, right away: the pointer moved onto another choice or dot.
    redrawChart() {
      drawChart(true);
    },
    setTab(tab) {
      ui.view.tab = tab;
      try {
        window.localStorage.setItem('devidle.tab', tab);
      } catch (e) {
        // a remembered tab is only a convenience
      }
      render();
    },
    pickLanguage(lang) {
      G.i18n.set(lang);
      G.i18n.chosen = true;
      const dialog = document.getElementById('lang');
      if (dialog.open) dialog.close();
      app.relabel();
    },
    // Erasing everything asks first, with what will be lost.
    openWipe() {
      const dialog = document.getElementById('wipe');
      document.getElementById('wipe-body').innerHTML = ui.wipeHtml(state);
      if (dialog.showModal) {
        if (!dialog.open) dialog.showModal();
      } else if (window.confirm(S.wipeLead)) app.reset();
    },
    closeWipe() {
      const dialog = document.getElementById('wipe');
      if (dialog.open) dialog.close();
    },
    reset() {
      if (app.minigame) app.minigame.close();
      if (storage) G.save.clear(storage, demo);
      ui.timeline.reset();
      state = newState();
      render();
      save();
    },
  };
  G.app = app;

  function boot() {
    const el = (id) => document.getElementById(id);
    panels.hud = new ui.Panel(el('hud'), ui.hud.structure, ui.hud.values);
    panels.current = new ui.Panel(el('current'), ui.current.structure, ui.current.values);
    panels.tabs = new ui.Panel(el('tabs'), ui.tabs.structure, null);
    panels.sheet = new ui.Panel(el('sheet'), ui.sheet.structure, ui.sheet.values);
    panels.caption = new ui.Panel(el('caption'), ui.caption.structure, null);
    panels.caffeine = new ui.Panel(el('caffeine'), ui.caffeine.structure, ui.caffeine.values);
    panels.event = new ui.Panel(el('event'), ui.eventCard.structure, ui.eventCard.values);
    panels.demo = new ui.Panel(el('demo'), ui.demoPanel.structure, ui.demoPanel.values);
    panels.tutorial = new ui.Panel(el('tutorial'), ui.tutorial.structure, null);
    scene = new ui.Scene(el('scene'));
    app.scene = scene;
    app.minigame = new ui.Minigame(el('scene'), app);
    try {
      const tab = window.localStorage.getItem('devidle.tab');
      if (['agents', 'upgrades', 'company'].includes(tab)) ui.view.tab = tab;
    } catch (e) {
      // keep the default tab
    }
    // Touch screens pick pieces of code in caffeine mode; ?touch=1 shows that on a PC.
    try {
      ui.view.touch = params.get('touch') === '1' || window.matchMedia('(pointer: coarse)').matches;
    } catch (e) {
      // no media queries: keyboard play
    }
    fillNotice();
    applyStaticText();
    G.input.attach(app);
    render();
    if (!storage) ui.toast(S.toastSaveOff, 'warn', 6000);
    if (away) showAway(away);
    // the very first start: ask for the language before anything else
    const pick = document.getElementById('lang');
    if (!G.i18n.chosen && pick && pick.showModal) {
      pick.showModal();
      // the language is a choice to make, not something to dismiss
      pick.addEventListener('cancel', (e) => e.preventDefault());
    }

    // Fixed-step simulation. Elapsed real time is measured each interval, so a
    // throttled background tab catches up (up to an hour) when it comes back.
    const DT = B.tickSeconds;
    let last = performance.now();
    let acc = 0;
    setInterval(() => {
      const now = performance.now();
      acc += Math.min(3600, (now - last) / 1000) * speed;
      last = now;
      let notes = [];
      while (acc >= DT) {
        const out = core.tick(state, DT);
        if (out.length) notes = notes.concat(out);
        acc -= DT;
      }
      handle(notes);
    }, 100);

    // Money floats up from the window every few seconds while apps earn.
    let lastRevenue = state.runRevenue;
    setInterval(() => {
      const earned = state.runRevenue - lastRevenue;
      lastRevenue = state.runRevenue;
      if (earned >= 0.01) scene.earned(earned);
    }, 2500);

    let lastRender = 0;
    const frame = (t) => {
      if (t - lastRender > 250) {
        lastRender = t;
        render();
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    setInterval(save, B.save.intervalSeconds * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
    window.addEventListener('pagehide', save);
  }

  function fillNotice() {
    const dump = G.codeDump;
    const list = document.getElementById('notice-list');
    if (!dump || !list) return;
    list.innerHTML = dump.sources
      .map(
        (src) =>
          `<details><summary><b>${ui.esc(src.pkg)} ${ui.esc(src.version)}</b> · ${ui.esc(src.license)} · ${ui.esc(src.copyright)}</summary>` +
          `<p class="small muted">${ui.esc(src.repo)} · ${ui.esc(src.files.join(', '))}</p><pre>${ui.esc(src.licenseText)}</pre></details>`
      )
      .join('');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.Game = window.Game || {});
