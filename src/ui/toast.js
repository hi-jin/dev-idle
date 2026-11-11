// Short messages at the top of the screen for things the player should notice.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const S = G.strings;

  let root = null;

  ui.toast = function (text, kind, ms, sub) {
    if (!root) root = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = text;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      el.appendChild(small);
    }
    root.appendChild(el);
    while (root.children.length > 2) root.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms || 3200);
    setTimeout(() => el.remove(), (ms || 3200) + 400);
  };

  function unlockText(stage) {
    const u = core.unlocksAt(stage);
    const items = u.agents.map((k) => ui.agentInfo(k).name).concat(u.apps.map((t) => ui.templateName(t)), u.fevers.map((k) => S.feverUnlockNames[k]), u.acceptAll ? [S.acceptAllName] : []);
    return items.length ? S.toastUnlocked(items.join(', ')) : '';
  }

  function eventToast(s, n) {
    if (n.kind === 'hallucination') {
      const agent = core.findAgent(s, n.agentId);
      if (agent) ui.toast(S.toastHallucination(ui.agentLabel(s, agent)), 'warn', 4500, ui.view.touch ? S.toastHallucinationSubTouch : S.toastHallucinationSub);
    } else if (n.kind === 'viral') {
      const app = core.findApp(s, n.appId);
      if (app) ui.toast(S.toastViral(ui.appName(app)), 'big', 4500, S.toastViralSub);
    } else if (n.kind === 'investor') {
      ui.toast(S.toastInvestor, 'big');
    } else if (n.kind === 'oss') {
      ui.toast(S.toastOss, 'big');
    }
  }

  function eventEndToast(s, n) {
    if (n.kind === 'viral') {
      const app = core.findApp(s, n.appId);
      if (app) ui.toast(S.toastViralEnd(ui.appName(app)));
    } else if (n.kind === 'hallucination') {
      if (n.squashed) ui.toast(S.toastSquashed(ui.money(n.cash)), 'good');
      else ui.toast(S.toastBugMissed, 'bad');
    } else if (n.kind === 'investor') {
      if (n.choice === 'accept') ui.toast(S.toastRaised(ui.money(n.cash)), 'good');
      else ui.toast(S.toastDeclined(ui.num(n.followers)), 'good');
    } else if (n.kind === 'oss') {
      if (n.done) ui.toast(S.toastOssDone(ui.num(n.followers)), 'good');
      else ui.toast(S.toastOssMissed, 'warn');
    }
  }

  // Turns notes from core.tick/core.act into toasts. A failed agent task gets
  // no toast: it happens every few seconds, and the robot's "oops" shows it.
  ui.notify = function (s, notes) {
    for (const n of notes) {
      if (n.type === 'stage') ui.toast(S.toastStage(n.stage, S.stageTitles[n.stage]), 'big', 4500, unlockText(n.stage));
      else if (n.type === 'appReady') {
        const app = core.findApp(s, n.appId);
        if (app) ui.toast(S.toastReady(ui.appName(app)), 'good');
      } else if (n.type === 'released') {
        const app = core.findApp(s, n.appId);
        if (app) ui.toast(S.toastReleased(ui.appName(app)), 'good', 4000, S.toastLaunchBonus(ui.money(n.bonus)));
      } else if (n.type === 'outage') {
        ui.toast(S.toastOutage, 'bad', 4500, ui.view.touch ? S.fireSceneTouch : S.fireScene);
      } else if (n.type === 'outageEnd') {
        ui.toast(n.byPlayer ? S.toastFireOut : S.toastFireBurned, n.byPlayer ? 'good' : 'warn');
      } else if (n.type === 'contextFull') {
        const agent = core.findAgent(s, n.agentId);
        if (agent) ui.toast(S.toastFull(ui.agentLabel(s, agent)), 'warn', 4500);
      } else if (n.type === 'feverStart') {
        ui.toast(S.toastFeverStartKind[n.kind] || S.toastFeverStart, 'big');
      } else if (n.type === 'feverEnd') {
        if (n.kind === 'prompt') ui.toast(S.toastPromptEnd(n.prompts, ui.num(n.boost * 100)), 'good', 4500);
        else if (n.kind === 'review') ui.toast(S.toastReviewEnd(n.bugs, n.cards, ui.money(n.cash)), 'good', 4500);
        else ui.toast(S.toastFeverEnd(n.cpm, n.correct), 'good');
      } else if (n.type === 'compressed' && !n.auto) {
        ui.toast(S.toastCompressed(ui.pct(n.quality), ui.num(Math.round(n.focus * 10) / 10)), n.quality >= 0.95 ? 'good' : '');
      } else if (n.type === 'league') {
        ui.toast(S.toastLeague(S.leagues[n.league], ui.money(n.cash)), 'big', 4500);
      } else if (n.type === 'achievement') {
        ui.toast(S.toastAchievement(ui.achievementName(n.id)), 'big', 4000, S.toastAchievementSub);
      } else if (n.type === 'event') {
        eventToast(s, n);
      } else if (n.type === 'eventEnd') {
        eventEndToast(s, n);
      }
    }
  };
})(window.Game = window.Game || {});
