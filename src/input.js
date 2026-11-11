// Keyboard, pointer and button input. Everything goes through G.app.
(function (G) {
  'use strict';
  const core = G.core;
  const S = G.strings;

  const FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

  // Demo tools (FR-28). Speed and the touch view belong to the screen, the rest to the game.
  function demo(app, d) {
    if (d.action === 'speed') {
      app.speed = Number(d.speed);
      app.act({ type: 'noop' });
      return;
    }
    if (d.action === 'touch') {
      G.ui.view.touch = !G.ui.view.touch;
      app.act({ type: 'noop' });
      return;
    }
    const a = { type: 'demo', action: d.action };
    if (d.stage) a.stage = Number(d.stage);
    if (d.kind) a.kind = d.kind;
    if (d.seconds) a.seconds = Number(d.seconds);
    const { ok } = app.act(a);
    if (!ok) G.ui.toast(S.demoNotNow, 'warn');
  }

  G.input = {
    attach(app) {
      document.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.target && FIELDS.has(e.target.tagName)) return;
        // the choice window: Enter makes the choice (Escape closes it by itself)
        const asking = document.querySelector('#choice[open]');
        if (asking) {
          if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            e.preventDefault();
            const ok = asking.querySelector('[data-act="choiceOk"]');
            if (ok && !ok.disabled) app.confirmChoice();
          }
          return;
        }
        if (document.querySelector('dialog[open]')) return;
        const mg = app.minigame;
        if (mg && mg.active) {
          if (e.code === 'Escape') mg.close();
          else if (core.isTypingKey(e.code)) {
            e.preventDefault();
            if (!e.repeat) mg.press();
          }
          return;
        }
        if (!core.isTypingKey(e.code)) return;
        // Space and Enter would also press a focused button, and Space would scroll.
        e.preventDefault();
        if (e.repeat) return;
        app.act({ type: 'key', code: e.code, shift: e.shiftKey });
      });

      // Tapping the desk types too, for touch screens. Tapping a robot that can
      // be compacted opens the compacting game instead.
      document.getElementById('scene').addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        if (e.pointerType === 'touch') G.ui.view.touch = true;
        const mg = app.minigame;
        if (mg && mg.active) {
          mg.press();
          return;
        }
        // the hallucinated bug: squash it
        if (e.target.closest && e.target.closest('.critter')) {
          app.act({ type: 'event', choice: 'squash' });
          return;
        }
        const botId = app.scene && app.scene.botAt(e.target);
        if (botId && mg && mg.open(botId)) return;
        app.act({ type: 'tap' });
      });

      // Pointing at a choice shows its forecast on the chart; pointing at a
      // dot on the chart shows what skipping that choice would have done.
      const T = G.ui.timeline;
      document.addEventListener('mouseover', (e) => {
        const row = e.target.closest ? e.target.closest('[data-preview]') : null;
        const dot = e.target.closest ? e.target.closest('[data-mark]') : null;
        const hover = row ? row.dataset.preview : null;
        const mark = dot ? Number(dot.dataset.mark) : null;
        if (hover === T.hover && mark === T.hoverMark) return;
        T.hover = hover;
        T.hoverMark = mark;
        app.redrawChart();
      });

      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-act]');
        if (!el || el.disabled) return;
        // A button inside <summary> should not also open or close the row.
        if (el.closest('summary') && el.tagName === 'BUTTON') e.preventDefault();
        // Mouse clicks should not leave focus on a button, or the next Space press would click it.
        if (e.detail > 0 && el.blur) el.blur();
        const d = el.dataset;
        switch (d.act) {
          case 'tab':
            app.setTab(d.tab);
            break;
          case 'mark': {
            const id = Number(d.mark);
            T.sel = T.sel === id ? null : id;
            app.redrawChart();
            break;
          }
          case 'chartRange':
            T.full = !T.full;
            app.redrawChart();
            break;
          case 'setTypingTask':
            app.act({ type: 'setTypingTask', taskId: d.task });
            break;
          // Shift-click buys at once; a plain click first shows what it would do
          case 'buyAgent':
            if (e.shiftKey) app.act({ type: 'buyAgent', kind: d.kind });
            else app.openChoice({ type: 'buyAgent', kind: d.kind });
            break;
          case 'buyUpgrade':
            if (e.shiftKey) app.act({ type: 'buyUpgrade', key: d.key });
            else app.openChoice({ type: 'buyUpgrade', key: d.key });
            break;
          case 'dismiss':
            app.openChoice({ type: 'fireAgent', agentId: d.agent, kind: d.kind });
            break;
          case 'choiceOk':
            app.confirmChoice();
            break;
          case 'choiceCancel':
            app.closeChoice();
            break;
          case 'drink':
            app.act({ type: 'drink' });
            break;
          case 'acceptAll':
            app.act({ type: 'acceptAll', on: !app.state.acceptAll.on });
            break;
          case 'autoCompress':
            app.act({ type: 'autoCompress', on: !app.state.upgrades.autoCompressOn });
            break;
          case 'compact':
            if (app.minigame) app.minigame.open(d.agent);
            break;
          case 'postAchievement':
            app.act({ type: 'postAchievement', id: d.id });
            break;
          case 'exit': {
            const st = app.state;
            const value = core.valuation(st);
            const msg = S.confirmExit(G.ui.money(value), core.exitGrade(value), G.ui.num(core.exitPoints(st)));
            if (window.confirm(msg)) app.act({ type: 'exit' });
            break;
          }
          case 'release':
            app.act({ type: 'release', appId: d.app });
            break;
          case 'pick':
            app.act({ type: 'pick', index: Number(d.index) });
            break;
          case 'event':
            app.act({ type: 'event', choice: d.choice });
            break;
          case 'review':
            app.act({ type: 'review', choice: d.choice === 'ok' ? 'ok' : Number(d.choice) });
            break;
          case 'feverKind':
            app.act({ type: 'feverKind', kind: d.kind });
            break;
          case 'demo':
            demo(app, d);
            break;
          case 'lang':
            G.i18n.set(G.i18n.other());
            app.relabel();
            break;
          case 'sound':
            G.ui.sound.setMuted(!G.ui.sound.muted);
            G.ui.sound.play('pop');
            app.act({ type: 'noop' });
            break;
          case 'notice':
            document.getElementById('notice').showModal();
            break;
          case 'reset':
            app.openWipe();
            break;
          case 'wipeOk':
            app.closeWipe();
            app.reset();
            break;
          case 'wipeCancel':
            app.closeWipe();
            break;
          case 'tutorialOk':
            app.act({ type: 'tutorial', step: app.state.tutorial.step + 1 });
            break;
          case 'tutorialSkip':
            app.act({ type: 'tutorial', skip: true });
            break;
          default:
            break;
        }
      });
    },
  };
})(window.Game = window.Game || {});
