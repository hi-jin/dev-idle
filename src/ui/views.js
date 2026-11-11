// Structure and value functions for the HUD, the current-app card, the tab
// bar and the tab sheet. Structure functions return HTML that changes only
// when something is added, removed, reassigned or unlocked. Value functions
// return [key, value] pairs patched in place.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const B = G.balance;
  const C = G.content;
  const S = G.strings;
  const esc = (t) => ui.esc(t);

  // touch: caffeine mode shows three pieces of code to tap (FR-30)
  ui.view = { tab: 'agents', touch: false };

  function bar(key, cls) {
    return `<div class="bar ${cls || ''}"><i data-v="${key}"></i></div>`;
  }

  function appIcon(template) {
    const def = C.apps[template];
    return `<span class="app-icon" style="background:${def.color}">${esc(def.letter)}</span>`;
  }

  function featureProgress(app) {
    const features = app.tasks.filter((t) => t.kind === 'feature');
    const total = features.reduce((n, t) => n + t.lines, 0);
    const done = features.reduce((n, t) => n + Math.min(t.lines, t.progress), 0);
    return total ? done / total : 0;
  }

  function currentApp(s) {
    return s.apps.find((a) => a.status === 'building') || null;
  }

  function pct(x) {
    return (Math.max(0, Math.min(1, x)) * 100).toFixed(1) + '%';
  }

  // ---------- HUD ----------

  // The mute button's icon: a speaker with sound waves, or with a cross when muted.
  const SPEAKER =
    '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>' +
    '<path class="waves" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>' +
    '<path class="cross" d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  // Two small meters under the money: how much your typing hurries the agents,
  // and how full the bug gauge is.
  function meters(s) {
    const boost = s.agents.length
      ? `<div class="meter boost" title="${esc(S.boostHelp)}"><small>${S.boostLabel}</small>${bar('heat', 'thin')}<b data-v="heatText"></b></div>`
      : '';
    const bugs =
      s.stage >= B.acceptAll.stage
        ? `<div class="meter bug" data-v="bugMeter" title="${esc(S.bugsHelp)}"><small>${S.bugsLabel}</small>${bar('bugs', 'thin')}<b data-v="bugsText"></b></div>`
        : '';
    return boost || bugs ? `<div class="meters-row">${boost}${bugs}</div>` : '';
  }

  ui.hud = {
    structure(s) {
      return (
        `<div class="hud-row"><div><small data-v="stage"></small><b class="money" data-v="money"></b></div>` +
        `<div class="right"><small>${S.perMinute}</small><b class="rate" data-v="rate"></b>` +
        (s.stage >= B.acceptAll.stage
          ? `<button class="switch${s.acceptAll.on ? ' on' : ''}" data-act="acceptAll" data-preview="acceptAll" title="${esc(S.acceptAllHelp)}">${s.acceptAll.on ? S.acceptAllOn : S.acceptAllOff}</button>`
          : '') +
        `</div></div>` +
        meters(s) +
        `<div class="next">${bar('nextBar', 'thin')}<small data-v="nextText"></small>` +
        `<button class="lang-btn" data-act="lang" title="${esc(S.language)}" lang="${G.i18n.other()}">${esc(S.otherLanguage)}</button>` +
        `<button class="sound-btn" data-act="sound" data-v="sound">${SPEAKER}</button></div>` +
        (s.demo ? `<span class="demo-badge">${esc(S.demoBadge(G.app ? G.app.speed : 1))}</span>` : '')
      );
    },
    values(s) {
      const prog = core.stageProgress(s);
      const muted = ui.sound ? ui.sound.muted : false;
      const out = [
        ['sound', { toggle: { muted }, attr: { 'aria-label': muted ? S.soundOff : S.soundOn, title: muted ? S.soundOff : S.soundOn } }],
        ['stage', S.stageLine(s.stage, S.stageTitles[s.stage])],
        ['money', ui.money(s.money)],
        ['rate', '+' + ui.money(core.companyRevenue(s))],
      ];
      if (prog) {
        out.push(['nextBar', { width: pct(prog.value) }]);
        out.push(['nextText', S.nextRelease(S.stageTitles[prog.next.stage], ui.templateName(prog.template))]);
      } else {
        const next = core.nextGrade(core.valuation(s));
        out.push(['nextBar', { width: next ? pct(core.valuation(s) / next.from) : '100%' }]);
        out.push(['nextText', next ? S.nextGrade(next.id, ui.money(next.from)) : S.maxStage]);
      }
      out.push(['heat', { width: pct(s.typing.heat / B.heat.max) }], ['heatText', '×' + ui.num(Math.round(core.heatBoost(s) * 10) / 10)]);
      out.push(['bugs', { width: pct(s.bugs) }], ['bugsText', Math.round(s.bugs * 100) + '%']);
      out.push(['bugMeter', { toggle: { hot: s.bugs >= 0.7 } }]);
      return out;
    },
  };

  // ---------- current app ----------

  // The features of an app, each with its parts (bigger apps split a feature
  // into several tasks).
  function featureGroups(app) {
    const groups = [];
    const byName = new Map();
    for (const t of app.tasks) {
      if (t.kind !== 'feature') continue;
      if (!byName.has(t.name)) {
        byName.set(t.name, { name: t.name, tasks: [] });
        groups.push(byName.get(t.name));
      }
      byName.get(t.name).tasks.push(t);
    }
    return groups;
  }

  // One pill per feature: who is on it, and how many of its parts are done.
  function pill(s, group, typingId) {
    const open = group.tasks.filter((t) => !t.done);
    const done = group.tasks.length - open.length;
    const typing = open.find((t) => t.id === typingId);
    const kinds = [];
    for (const t of open) {
      const agent = t.assignee ? core.findAgent(s, t.assignee) : null;
      if (agent && !kinds.includes(agent.kind)) kinds.push(agent.kind);
    }
    let cls = 'wait';
    let mark = '';
    if (!open.length) {
      cls = 'done';
      mark = '✓';
    } else if (typing) {
      cls = 'you';
      mark = ui.devIcon() + kinds.slice(0, 2).map((k) => ui.robotIcon(k)).join('');
    } else if (kinds.length) {
      cls = 'bot';
      mark = kinds.slice(0, 3).map((k) => ui.robotIcon(k)).join('');
    }
    // clicking a feature moves your typing to its next part
    const next = open.find((t) => !t.assignee) || open[0];
    const act = next ? ` data-act="setTypingTask" data-task="${next.id}"` : '';
    const count = group.tasks.length > 1 && open.length ? ` <small>${done}/${group.tasks.length}</small>` : '';
    return `<li class="pill ${cls}"${act}>${mark}<span>${esc(ui.taskName(group.name))}</span>${count}</li>`;
  }

  ui.current = {
    structure(s) {
      return currentCard(s);
    },
    values(s) {
      const app = currentApp(s);
      return app ? [['cur', { width: pct(featureProgress(app)) }]] : [];
    },
  };

  function currentCard(s) {
    const app = currentApp(s);
    if (!app) {
      return (
        `<div class="current empty"><p>${S.allReleased}</p>` +
        `<button class="primary" data-act="tab" data-tab="company">${S.goSell}</button></div>`
      );
    }
    const features = featureGroups(app);
    const done = features.filter((g) => g.tasks.every((t) => t.done)).length;
    const ready = core.isReleaseReady(app);
    const target = core.peekTypingTarget(s);
    const typingId = target ? target.task.id : null;
    return (
      `<div class="current${ready ? ' ready' : ''}">` +
      `<div class="cur-head">${appIcon(app.template)}<b>${esc(ui.appName(app))}</b><small>${S.featuresDone(done, features.length)}</small></div>` +
      bar('cur', 'big') +
      `<ul class="pills">${features.map((g) => pill(s, g, typingId)).join('')}</ul>` +
      (ready
        ? `<button class="primary release pulse" data-act="release" data-app="${app.id}">${S.releaseApp(esc(ui.appName(app)))}</button>`
        : `<p class="hint">${S.keepTyping}</p>`) +
      `</div>`
    );
  }

  // ---------- caffeine row ----------

  const pts = (x) => ui.num(Math.round(x * 1000) / 10);

  // Three buttons to tap in caffeine mode on touch screens (FR-30).
  function chunkButtons(hint) {
    return `<div class="chunks" aria-label="${hint}">${[0, 1, 2].map((i) => `<button class="chunk" data-act="pick" data-index="${i}" data-v="chunk${i}"></button>`).join('')}</div>`;
  }

  // From stage 3: which kind the next caffeine mode is (FR-05, FR-06).
  function feverPicker(s) {
    if (!core.feverUnlocked(s, 'prompt')) return '';
    const buttons = core.FEVER_KINDS.map((k) =>
      core.feverUnlocked(s, k)
        ? `<button class="fk" data-act="feverKind" data-kind="${k}" data-v="fk-${k}">${S.feverKindNames[k]}</button>`
        : `<button class="fk" disabled>${S.feverKindNames[k]} <small>${S.feverFrom(B.feverKinds[k])}</small></button>`
    ).join('');
    return `<div class="fever-kinds"><small>${S.feverNext}</small><div class="fk-row">${buttons}</div></div><p class="fk-help" data-v="fkHelp"></p>`;
  }

  // The change under review, with a button per line.
  function reviewCard(s) {
    const card = core.reviewCard(s);
    if (core.reviewWait(s) > 0) return `<div class="review wait"><p data-v="rvWait"></p></div>`;
    const cls = { '+': 'add', '-': 'del', ' ': 'ctx' };
    const lines = card.lines
      .map((line, i) => `<button class="rv-line ${cls[line[0]] || 'ctx'}" data-act="review" data-choice="${i}"><span class="rv-no">${i + 1}</span><span class="rv-mark">${esc(line[0])}</span><code>${esc(line.slice(1))}</code></button>`)
      .join('');
    return (
      `<div class="review"><div class="rv-head"><b>${esc(ui.reviewText(card).title)}</b><small>${esc(card.file)}</small></div>` +
      `<div class="rv-lines">${lines}</div>` +
      `<div class="rv-foot"><button class="primary rv-ok" data-act="review" data-choice="ok">${S.reviewOk}${ui.view.touch ? '' : ' <kbd>Enter</kbd>'}</button>` +
      `<small>${ui.view.touch ? S.reviewHint : S.reviewKeys}</small></div></div>`
    );
  }

  function reviewResult(s) {
    const last = core.reviewLast(s);
    if (!last) return '';
    const bugLine = last.card.bug === null ? 0 : last.card.bug + 1;
    const why = ui.reviewText(last.card).why;
    let text;
    if (last.right) text = last.card.bug === null ? S.reviewRightClean(why) : S.reviewRightBug(bugLine, why);
    else text = last.card.bug === null ? S.reviewMissedClean(why) : S.reviewMissedBug(bugLine, why);
    return `<p class="rv-last ${last.right ? 'right' : 'wrong'}">${esc(text)}</p>`;
  }

  ui.caffeine = {
    structure(s) {
      const kind = core.feverKind(s);
      if (kind) {
        const label = { typing: '', prompt: S.promptLabel, review: S.reviewLabel }[kind];
        const head = `<div class="caf on"><b data-v="cafLabel">${label}</b>${bar('caf')}<small data-v="cafTime"></small></div>`;
        if (!core.feverReady(s)) return head + `<p class="fever-status">${S.getReady}</p>`;
        if (kind === 'prompt') {
          const line = `<p class="prompt-line"><span class="p-done" data-v="pDone"></span><span class="want" data-v="pWant"></span><span class="p-ahead" data-v="pAhead"></span></p>`;
          return head + line + `<p class="fever-status" data-v="fStatus"></p>` + (ui.view.touch ? chunkButtons(S.promptHint) : '');
        }
        if (kind === 'review') return head + reviewCard(s) + reviewResult(s) + `<p class="fever-status" data-v="fStatus"></p>`;
        return head + (ui.view.touch ? chunkButtons(S.pickHint) : '');
      }
      const boost = core.promptBoost(s) > 0 ? `<p class="boost" data-v="boost"></p>` : '';
      return `<div class="caf"><small>${S.caffeine}</small>${bar('caf')}<button class="drink" data-act="drink" data-v="drink"></button></div>` + feverPicker(s) + boost;
    },
    values(s) {
      const kind = core.feverKind(s);
      if (kind) {
        const f = s.caffeine.fever;
        const left = f.endsAt - s.clock.totalSeconds;
        const rows = [
          ['caf', { width: pct(left / B.typing.feverSeconds) }],
          ['cafTime', S.secondsLeft(Math.ceil(left))],
        ];
        if (kind === 'typing') rows.push(['cafLabel', S.feverLabel(ui.num(core.feverMultiplier(s)))]);
        if (kind === 'prompt') {
          const text = core.promptText(s);
          rows.push(
            ['pDone', text.slice(0, f.cursor)],
            ['pWant', text[f.cursor] === ' ' ? '\u00a0' : text[f.cursor] || ''],
            ['pAhead', text.slice(f.cursor + 1)],
            ['fStatus', S.promptStatus(f.prompts, pts(core.promptBoost(s)))]
          );
        }
        if (kind === 'review') rows.push(['fStatus', S.reviewStatus(f.bugs, ui.money(f.cash))], ['rvWait', S.reviewNext(Math.ceil(core.reviewWait(s)))]);
        const choices = ui.view.touch && core.feverChoices(s);
        if (choices) choices.options.forEach((text, i) => rows.push(['chunk' + i, text]));
        return rows;
      }
      const why = core.canDrink(s);
      const text = why === 'cooldown' ? S.drinkIn(ui.clock(core.drinkCooldown(s))) : S.drink(ui.money(core.drinkPrice(s)));
      const next = core.nextFeverKind(s);
      const rows = [
        ['caf', { width: pct(s.caffeine.gauge / B.typing.gaugeMax) }],
        ['drink', { text, disabled: !!why }],
        ['fkHelp', S.feverKindHelp[next]],
        ['boost', S.promptBoost(pts(core.promptBoost(s)), ui.clock(core.promptBoostLeft(s)))],
      ];
      for (const k of core.FEVER_KINDS) rows.push(['fk-' + k, { toggle: { on: k === next } }]);
      return rows;
    },
  };

  // ---------- random events (FR-23) ----------

  ui.eventCard = {
    structure(s) {
      if (core.inOutage(s)) {
        return (
          `<div class="event fire"><b>${S.fireTitle}</b><p>${ui.view.touch ? S.fireBodyTouch : S.fireBody}</p>` +
          `<div class="ev-progress">${bar('fire')}<small data-v="fireKeys"></small></div>` +
          `<div class="ev-time">${bar('evTime', 'thin')}<small data-v="evLeft"></small></div></div>`
        );
      }
      const ev = s.events.current;
      if (!ev) return '';
      const timer = `<div class="ev-time">${bar('evTime', 'thin')}<small data-v="evLeft"></small></div>`;
      if (ev.kind === 'hallucination') {
        const agent = core.findAgent(s, ev.agentId);
        return (
          `<div class="event bug"><b>${S.bugTitle(esc(agent ? ui.agentLabel(s, agent) : ''))}</b><p>${S.bugBody}</p>` +
          `<div class="ev-actions"><button class="primary" data-act="event" data-choice="squash">${S.bugSquash(ui.money(ev.cash))}</button></div>${timer}</div>`
        );
      }
      if (ev.kind === 'viral') {
        const app = core.findApp(s, ev.appId);
        return `<div class="event viral"><b>${S.viralTitle(esc(app ? ui.appName(app) : ''))}</b><p>${S.viralBody}</p>${timer}</div>`;
      }
      if (ev.kind === 'investor') {
        return (
          `<div class="event investor"><b>${S.investorTitle}</b><p>${S.investorBody}</p>` +
          `<div class="ev-actions"><button class="primary" data-act="event" data-choice="accept">${S.investorAccept(ui.money(ev.cash))}</button>` +
          `<button data-act="event" data-choice="decline">${S.investorDecline(ui.num(ev.followers))}</button></div>${timer}</div>`
        );
      }
      if (ev.kind === 'oss') {
        return `<div class="event oss"><b>${S.ossTitle}</b><p>${S.ossBody(ev.goal)}</p><div class="ev-progress">${bar('evKeys')}<small data-v="evKeys2"></small></div>${timer}</div>`;
      }
      return '';
    },
    values(s) {
      if (core.inOutage(s)) {
        const o = s.outage;
        const left = o.until - s.clock.runSeconds;
        return [
          ['fire', { width: pct(o.keys / o.goal) }],
          ['fireKeys', `${o.keys}/${o.goal}`],
          ['evTime', { width: pct(left / B.outage.seconds) }],
          ['evLeft', S.secondsShort(Math.max(0, Math.ceil(left)))],
        ];
      }
      const ev = s.events.current;
      if (!ev) return [];
      const left = ev.until - s.clock.runSeconds;
      const rows = [
        ['evTime', { width: pct(left / (ev.until - ev.at)) }],
        ['evLeft', S.secondsShort(Math.max(0, Math.ceil(left)))],
      ];
      if (ev.kind === 'oss') rows.push(['evKeys', { width: pct(ev.keys / ev.goal) }], ['evKeys2', `${ev.keys}/${ev.goal}`]);
      return rows;
    },
  };

  // ---------- demo tools (FR-28) ----------

  ui.demoPanel = {
    structure(s) {
      if (!s.demo) return '';
      const btn = (label, data, key) => `<button data-act="demo" ${data}${key ? ` data-v="${key}"` : ''}>${label}</button>`;
      return (
        `<details class="demo-tools" open><summary>${S.demoTitle}</summary>` +
        `<div class="demo-row"><small>${S.demoSpeed}</small>${[1, 5, 10, 50].map((x) => btn('×' + x, `data-action="speed" data-speed="${x}"`, 'speed' + x)).join('')}</div>` +
        `<div class="demo-row"><small>${S.demoStage}</small>${[2, 3, 4, 5].map((x) => btn(String(x), `data-action="stage" data-stage="${x}"`, 'stage' + x)).join('')}</div>` +
        `<div class="demo-row">${btn(S.demoMoney, 'data-action="money"')}${btn(S.demoOutage, 'data-action="outage"')}${btn(S.demoSkip, 'data-action="skip" data-seconds="3600"')}</div>` +
        `<div class="demo-row"><small>${S.demoEvents}</small>${core.EVENT_KINDS.map((k) => btn(S.eventNames[k], `data-action="event" data-kind="${k}"`)).join('')}</div>` +
        `<div class="demo-row"><small>${S.demoFever}</small>${core.FEVER_KINDS.map((k) => btn(S.feverKindNames[k], `data-action="fever" data-kind="${k}"`, 'fever-' + k)).join('')}</div>` +
        `<div class="demo-row">${btn(S.demoTouch, 'data-action="touch"', 'touch')}</div>` +
        `</details>`
      );
    },
    values(s) {
      if (!s.demo) return [];
      const speed = G.app ? G.app.speed : 1;
      const rows = [[ 'touch', { toggle: { on: ui.view.touch } } ]];
      for (const x of [1, 5, 10, 50]) rows.push(['speed' + x, { toggle: { on: speed === x } }]);
      for (const x of [2, 3, 4, 5]) rows.push(['stage' + x, { disabled: s.stage >= x }]);
      for (const k of core.FEVER_KINDS) rows.push(['fever-' + k, { disabled: core.feverActive(s) || !core.feverUnlocked(s, k) }]);
      return rows;
    },
  };

  // The "While you were away" summary (FR-27).
  ui.awayHtml = function (s, sum) {
    const R = S.awayRows;
    const h = Math.floor(sum.seconds / 3600);
    const m = Math.floor((sum.seconds % 3600) / 60);
    const row = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
    let rows = row(R.earned, '+' + ui.money(sum.earned)) + row(R.money, (sum.money >= 0 ? '+' : '−') + ui.money(Math.abs(sum.money))) + row(R.tasks, ui.num(sum.tasks));
    if (sum.failed) rows += row(R.failed, ui.num(sum.failed));
    if (sum.outages) rows += row(R.outages, ui.num(sum.outages));
    if (sum.stageTo > sum.stageFrom) rows += row(R.stage, `${sum.stageFrom} → ${sum.stageTo} · ${esc(S.stageTitles[sum.stageTo])}`);
    const ready = sum.ready.map((id) => core.findApp(s, id)).filter(Boolean).map((a) => esc(ui.appName(a)));
    return (
      `<p>${S.awayLead(S.hoursMinutes(h, m))}</p><table class="away">${rows}</table>` +
      (ready.length ? `<p class="ready-note">${S.awayReady(ready.join(', '))}</p>` : '') +
      (sum.seconds >= B.offline.maxSeconds ? `<p class="small muted">${S.awayCap}</p>` : '')
    );
  };

  // Before erasing everything (2026-11-11): what exactly goes, in numbers.
  // Selling a company keeps points and achievements; this does not.
  ui.wipeHtml = function (s) {
    const got = Object.keys(s.social.achievements).length;
    const items = [S.wipeRun(s.stage, S.stageTitles[s.stage], ui.money(s.money))];
    items.push(S.wipePoints(ui.num(s.prestige.points)));
    items.push(S.wipeAchievements(got, ui.num(s.social.followers)));
    if (s.prestige.exits > 0) items.push(S.wipeBest(s.prestige.exits, ui.money(s.prestige.bestValuation)));
    return (
      `<h2>${S.wipeTitle}</h2><p>${S.wipeLead}</p>` +
      `<div class="verdict e-worse"><b>${S.wipeListTitle}</b><ul>${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` +
      `<p class="small">${S.wipeNote}</p>` +
      `<div class="choice-acts"><button data-act="wipeCancel">${S.cancel}</button><button class="danger" data-act="wipeOk">${S.wipeOk}</button></div>`
    );
  };

  // The result of a sale (FR-22): grade, price, time, and what carries over.
  ui.resultHtml = function (n, analysis) {
    const m = Math.floor(n.seconds / 60);
    const sec = Math.floor(n.seconds % 60);
    const row = (label, value) => `<tr><th>${label}</th><td>${value}</td></tr>`;
    const R = S.resultRows;
    const record = n.value > n.bestBefore && n.exits > 1 ? `<p class="ready-note">${S.resultRecord}</p>` : '';
    return (
      `<div class="grade g-${n.grade}"><small>${S.resultTitle}</small><b>${n.grade}</b><span>${esc(S.gradeNames[n.grade])}</span></div>` +
      `<table class="away">${row(R.value, ui.money(n.value))}${row(R.time, S.minutesSeconds(m, sec))}${row(R.apps, ui.num(n.apps))}${row(R.agents, ui.num(n.agents))}${row(R.points, '+' + ui.num(n.points))}</table>` +
      record +
      resultChoices(n, analysis) +
      `<p class="small muted">${S.resultKeep}</p>`
    );
  };

  // The window before a choice (2026-11-11): the chart with and without it,
  // the numbers that change, why, and the button that makes the choice.
  ui.choiceHtml = function (s, action, look) {
    const T = ui.timeline;
    const now = s.clock.runSeconds;
    let title;
    let info;
    let price = 0;
    let why = null;
    let button;
    if (action.type === 'buyAgent') {
      const def = ui.agentInfo(action.kind);
      title = S.choiceHire(def.name);
      info = def.blurb;
      price = core.agentPrice(s, action.kind);
      why = core.canBuyAgent(s, action.kind);
      button = S.choiceHireBtn(ui.money(price));
    } else if (action.type === 'buyUpgrade') {
      const u = S.upgrades[action.key];
      title = S.choiceUpgrade(u.name, core.upgradeLevel(s, action.key) + 1);
      info = u.info;
      price = core.upgradePrice(s, action.key);
      why = core.canBuyUpgrade(s, action.key);
      button = S.choiceBuyBtn(ui.money(price));
    } else {
      title = S.choiceDismiss(ui.agentInfo(action.kind).name);
      info = S.choiceDismissInfo;
      button = S.choiceDismissBtn(ui.money(core.agentRefund(s, action.kind)));
    }
    const effect = T.effect(look);
    const reasons = T.reasons(s, action, look);
    const rel = (r) => {
      const x = r && r.releases[0];
      return x ? S.statIn(T.span(Math.max(1, x.t - now))) : S.statNoRelease;
    };
    // when the valuation reaches the next line on the chart
    const reach = (r) => {
      const t = core.reachTime(r, look.goal.v);
      return t == null ? S.statNoRelease : t - now < 1 ? S.statNow : S.statIn(T.span(t - now));
    };
    const at2 = (r) => {
      let v = r.series[0][1];
      for (const p of r.series) {
        if (p[0] - now > 120) break;
        v = p[1];
      }
      return ui.money(v);
    };
    const row = (label, a, b) => `<tr><th>${label}</th><td>${a}${b !== a ? ` <span class="arrow">→</span> <b>${b}</b>` : ''}</td></tr>`;

    // The verdict and its reasons belong together, right under the title.
    const verdict = look.alt
      ? `<div class="verdict e-${effect}"><b>${S.effects[effect]}</b>` +
        (reasons.length ? `<ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : '') +
        `</div>`
      : reasons.length
        ? `<div class="verdict e-small"><ul>${reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></div>`
        : '';

    let body = '';
    if (look.alt) {
      const c = look.cmp;
      const still = (x) => x == null || Math.abs(x) < 3;
      const a = look.base.shares;
      const b = look.alt.shares;
      const building = look.shares.building;
      // who writes the code, now and with the choice
      const speedChanged = Math.abs(a.typing + a.agents - (b.typing + b.agents)) > 0.05;
      // shown even when nothing changes: the two equal bars say so at a glance
      if (building) {
        const max = Math.max(a.typing + a.agents, b.typing + b.agents, 0.1);
        const bar = (label, x, cls) =>
          `<div class="speed-row ${cls}"><span>${label}</span><div class="speed-bar"><i class="you" style="width:${((x.typing / max) * 100).toFixed(1)}%"></i><i class="bots" style="width:${((x.agents / max) * 100).toFixed(1)}%"></i></div>` +
          `<b>${S.speedValue(ui.num(Math.round((x.typing + x.agents) * 10) / 10))}</b></div>`;
        const diff = a.typing + a.agents > 0 ? Math.round(((b.typing + b.agents) / (a.typing + a.agents) - 1) * 100) : 0;
        body +=
          `<div class="choice-part"><div class="part-head"><b>${S.speedTitle}</b>` +
          `<span class="legend"><i class="k-you"></i>${S.speedYou}<i class="k-bots"></i>${S.speedAgents}</span>` +
          `<span class="part-diff">${diff > 0 ? '+' : ''}${diff}%</span></div>` +
          bar(S.speedNow, a, 'base') +
          bar(S.speedThen, b, 'alt') +
          `</div>`;
      }
      // how the app being built fills up over time
      const app = currentApp(s);
      const progress = building && (!still(c.sooner) || speedChanged) ? ui.chart.progressHtml(s, look) : '';
      if (progress) {
        body +=
          `<div class="choice-part"><div class="part-head"><b>${S.progressTitle(esc(app ? ui.appName(app) : ''))}</b>` +
          `<span class="legend"><i class="l-fore"></i>${S.choiceLegendBase}<i class="l-alt"></i>${S.choiceLegendAlt}</span></div>${progress}</div>`;
      }
      // money only when the choice moves money and not time (an ad campaign), or when every app is out
      if ((!building || (still(c.sooner) && still(c.goalSooner))) && Math.abs(c.gain) >= 0.02) {
        body +=
          `<div class="choice-part"><div class="part-head"><b>${S.valueTitle}</b>` +
          `<span class="legend"><i class="l-fore"></i>${S.choiceLegendBase}<i class="l-alt"></i>${S.choiceLegendAlt}</span></div>${ui.chart.choiceHtml(s, look)}</div>`;
      }
      // with every app out there is no next release to wait for
      let rows = building ? row(S.statRelease, rel(look.base), rel(look.alt)) : '';
      // the time to the next goal; at the top grade, the valuation in 2 minutes
      rows += look.goal ? row(S.statGoal(look.goal.label), reach(look.base), reach(look.alt)) : row(S.statValue, at2(look.base), at2(look.alt));
      if (look.goal && still(c.sooner) && still(c.goalSooner) && Math.abs(c.gain) >= 0.02) rows += row(S.statValue, at2(look.base), at2(look.alt));
      if (look.base.outages || look.alt.outages) rows += row(S.statOutages, S.times(look.base.outages), S.times(look.alt.outages));
      body += `<table class="away">${rows}</table>`;
    }
    const short = why === 'money' ? `<p class="choice-short">${S.choiceShort(ui.money(price - s.money))}</p>` : '';
    return (
      `<h2>${esc(title)}</h2>` +
      `<p class="small">${esc(info)}</p>` +
      verdict +
      body +
      short +
      `<div class="choice-acts"><button data-act="choiceCancel">${S.close}</button>` +
      `<button class="primary" data-act="choiceOk" ${why ? 'disabled' : ''}>${esc(button)}</button></div>` +
      `<p class="small muted choice-hint">${ui.view.touch ? S.choiceNote : S.choiceHint}</p>`
    );
  };

  // The run's growth chart and the choices that moved the sale price most.
  function resultChoices(n, analysis) {
    const chart = ui.chart.resultHtml(n.log, n.seconds);
    if (!chart) return '';
    const top = (analysis || []).filter((r) => r.saved >= 5).slice(0, 3);
    const rows = top
      .map((r) => {
        const gain = r.saved === Infinity ? S.resultChoiceHuge : S.resultChoiceGain(ui.timeline.span(r.saved));
        return `<li><span>${ui.clock(r.mark.t)} · ${esc(ui.timeline.markText(r.mark))}</span><b>${gain}</b></li>`;
      })
      .join('');
    return (
      `<div class="result-chart"><small>${S.resultChart}</small>${chart}</div>` +
      (rows ? `<div class="result-top"><small>${S.resultTop}</small><ol>${rows}</ol><small class="muted">${S.resultTopNote}</small></div>` : '')
    );
  }

  // ---------- tabs ----------

  ui.tabs = {
    structure(s) {
      const tabs = [
        ['agents', S.tabAgents],
        ['upgrades', S.tabUpgrades],
        ['company', S.tabCompany],
      ];
      // the company tab asks for attention when there is an achievement to post or the company can be sold
      const unposted = C.achievements.filter((a) => core.canPostAchievement(s, a.id)).length;
      const todo = unposted + (core.canExit(s) ? 0 : 1);
      return tabs
        .map(([key, label]) => {
          let count = '';
          if (key === 'agents' && s.agents.length) count = ` <small>${s.agents.length}</small>`;
          else if (key === 'company' && todo) count = ` <small class="dot">${todo}</small>`;
          return `<button class="tab${ui.view.tab === key ? ' on' : ''}" data-act="tab" data-tab="${key}">${label}${count}</button>`;
        })
        .join('');
    },
  };

  // ---------- sheet: agents ----------

  function agentsSheet(s) {
    if (s.stage < 2) return `<p class="empty-note">${S.agentsLocked}</p>`;
    const owned = B.agentOrder
      .map((k) => [k, core.agentCount(s, k)])
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${ui.agentInfo(k).name} ×${n}`);
    const team = `<p class="team">${S.desks(s.agents.length, core.agentSlots(s))}${owned.length ? ' · ' + esc(owned.join(', ')) : ''}</p>`;
    const members = s.agents.length ? `<div class="list team-list">${s.agents.map((a) => memberRow(s, a)).join('')}</div><h3>${S.hireTitle}</h3>` : '';
    const kinds = B.agentOrder.filter((k) => B.agents[k].stage <= s.stage + 1);
    return team + members + `<div class="list">${kinds.map((k) => agentRow(s, k)).join('')}</div>` + `<p class="disclaimer">${S.disclaimer}</p>`;
  }

  function memberRow(s, agent) {
    const cfg = B.agents[agent.kind];
    const meters = [];
    if (cfg.context) meters.push(`<span>${S.contextLabel}</span>${bar('ctx:' + agent.id, 'thin')}`);
    return (
      `<div class="item member" data-v="mem:${agent.id}">${ui.robotIcon(agent.kind)}<div class="item-body"><b>${esc(ui.agentLabel(s, agent))}</b> <span class="tag focus-tag" data-v="fo:${agent.id}"></span>` +
      `<small data-v="st:${agent.id}"></small>` +
      (meters.length ? `<div class="meters">${meters.join('')}</div>` : '') +
      `</div>` +
      `<div class="member-acts">` +
      (cfg.context ? `<button class="buy" data-act="compact" data-agent="${agent.id}" data-v="cb:${agent.id}">${S.compact}</button>` : '') +
      `<button class="link" data-act="dismiss" data-agent="${agent.id}" data-kind="${agent.kind}">${S.dismiss}</button></div>` +
      `</div>`
    );
  }

  function memberStatus(s, agent) {
    const state = ui.agentState(agent);
    if (core.inOutage(s)) return S.stFire;
    if (state === 'full') return S.stFull;
    if (state === 'idle') return S.stIdle;
    // two parts of one feature show as one name
    const names = Array.from(new Set(agent.taskIds.map((id) => core.findTask(s, id)).filter(Boolean).map((f) => ui.taskName(f.task.name))));
    return S.stWorking(names.join(', '));
  }

  // The two numbers that tell agents apart, for the app being built right
  // now: how fast it writes, and how often it gets this app's tasks right.
  function agentFacts(s, kind) {
    const cfg = B.agents[kind];
    const speed = Math.round(core.agentBaseSpeed(s, kind) * 10) / 10;
    const app = currentApp(s);
    const tasks = app ? app.tasks.filter((t) => !t.done) : [];
    if (!tasks.length) return S.agentFacts(ui.num(speed), cfg.concurrency, null);
    const chances = tasks.map((t) => core.successChance(s, { kind }, t.difficulty));
    const lo = ui.pct(Math.min(...chances));
    const hi = ui.pct(Math.max(...chances));
    return S.agentFacts(ui.num(speed), cfg.concurrency, lo === hi ? `${lo}%` : `${lo}~${hi}%`);
  }

  function agentRow(s, kind) {
    const cfg = B.agents[kind];
    const def = ui.agentInfo(kind);
    if (cfg.stage > s.stage) {
      return (
        `<div class="item locked">${ui.robotIcon(kind)}<div class="item-body"><b>${esc(def.name)}</b>` +
        `<small>${S.unlocksAt(S.stageTitles[cfg.stage])}</small></div></div>`
      );
    }
    const acc = cfg.accuracy.map((p, i) => `<span class="acc d${i + 1}">${ui.pct(p)}%</span>`).join('');
    return (
      `<details class="item" data-preview="agent:${kind}"><summary>${ui.robotIcon(kind)}<div class="item-body"><b>${esc(def.name)}</b> <span class="tag">${esc(def.style)}</span> <span class="tag best" data-v="best:agent:${kind}"></span>` +
      `<small>${esc(def.blurb)}</small><small class="facts" data-v="facts:${kind}"></small></div>` +
      `<button class="buy" data-act="buyAgent" data-kind="${kind}" data-v="hire:${kind}"></button></summary>` +
      `<dl><dt>${S.speed}</dt><dd>${S.speedValue(cfg.speed, cfg.concurrency)}</dd>` +
      `<dt>${S.accuracy}</dt><dd class="accs">${acc}</dd></dl></details>`
    );
  }

  // ---------- sheet: upgrades ----------

  const UPGRADE_GROUPS = [
    ['groupYou', ['typing', 'prompt']],
    ['groupAgents', ['review', 'template', 'autoCompress', 'localGear']],
    ['groupCompany', ['ads']],
  ];

  function upgradeRow(s, key) {
    const u = B.shop[key];
    const info = S.upgrades[key];
    if ((u.stage || 1) > s.stage) {
      return `<div class="item locked"><span class="icon-svg key">${info.glyph}</span><div class="item-body"><b>${info.name}</b><small>${S.unlocksAt(S.stageTitles[u.stage])}</small></div></div>`;
    }
    const toggle =
      key === 'autoCompress' && s.upgrades.autoCompress >= 0
        ? `<button class="switch${s.upgrades.autoCompressOn ? ' on' : ''}" data-act="autoCompress">${s.upgrades.autoCompressOn ? S.on : S.off}</button>`
        : '';
    return (
      `<div class="item" data-preview="up:${key}"><span class="icon-svg key">${info.glyph}</span><div class="item-body"><b>${info.name}</b> <span class="tag" data-v="lv:${key}"></span> <span class="tag best" data-v="best:up:${key}"></span>` +
      `<small>${info.info}</small></div>${toggle}<button class="buy" data-act="buyUpgrade" data-key="${key}" data-v="up:${key}"></button></div>`
    );
  }

  function upgradesSheet(s) {
    // a group shows once one of its upgrades is at most a stage away
    return UPGRADE_GROUPS.map(([title, all]) => {
      const keys = all.filter((k) => (B.shop[k].stage || 1) <= s.stage + 1);
      return keys.length ? `<h3>${S[title]}</h3><div class="list">${keys.map((k) => upgradeRow(s, k)).join('')}</div>` : '';
    }).join('');
  }

  // ---------- sheet: company ----------

  function rewardText(reward) {
    const [type, v] = Object.entries(reward)[0];
    return S.reward[type](Math.round(v * 100));
  }

  // Valuation, the grade a sale would get now, and the sell button.
  function companyCard(s) {
    const why = core.canExit(s);
    const sell = why
      ? `<small>${why === 'stage' ? S.exitNeedsStage(S.stageTitles[B.exit.stage]) : S.exitNeedsValue(ui.money(B.exit.minValuation))}</small>`
      : `<button class="sell pulse" data-act="exit" data-v="sell"></button>`;
    return (
      `<div class="company"><div><small>${S.valuation}</small><b data-v="val"></b><small data-v="gradeNow"></small></div>` +
      `<div class="right"><small>${S.founderPoints}</small><b>${ui.num(s.prestige.points)}</b>${sell}</div></div>`
    );
  }

  function liveApp(s, app) {
    return (
      `<div class="item app-row">${appIcon(app.template)}<div class="item-body"><b>${esc(ui.appName(app))}</b> <span class="tag viral-tag" data-v="vt:${app.id}"></span>` +
      `<small data-v="al:${app.id}"></small></div></div>`
    );
  }

  function companySheet(s) {
    const live = s.apps.filter((a) => a.status === 'live');
    const apps = live.length ? `<h3>${S.appsTitle}</h3><div class="list">${live.map((a) => liveApp(s, a)).join('')}</div>` : '';

    const rows = core.ranking(s);
    const me = rows.findIndex((r) => r.id === 'you');
    const from = Math.max(0, Math.min(rows.length - 5, me - 2));
    const ranking = rows
      .slice(from, from + 5)
      .map((r, i) => {
        const you = r.id === 'you';
        return `<li class="${you ? 'you' : ''}"><span class="rank">${from + i + 1}</span><span>${you ? S.you : esc(r.name)}</span><small data-v="rv:${r.id}"></small></li>`;
      })
      .join('');

    const badge = (a) => {
      const got = !!s.social.achievements[a.id];
      const post = core.canPostAchievement(s, a.id)
        ? `<button class="buy" data-act="postAchievement" data-id="${a.id}">${S.post}</button>`
        : got ? `<small>${S.posted}</small>` : '';
      return (
        `<div class="item badge-row${got ? '' : ' locked'}"><span class="medal ${a.tier}">${got ? '★' : '☆'}</span>` +
        `<div class="item-body"><b>${esc(ui.achievementName(a.id))}</b><small>${esc(S.achievementHint[a.id])} · ${rewardText(a.reward)}</small></div>${post}</div>`
      );
    };
    // earned ones stay in view; the rest fold away so the tab stays short
    const earned = C.achievements.filter((a) => s.social.achievements[a.id]);
    const locked = C.achievements.filter((a) => !s.social.achievements[a.id]);
    const achievements =
      earned.map(badge).join('') +
      (locked.length ? `<details class="more"><summary>${S.moreToUnlock(locked.length)}</summary><div class="list">${locked.map(badge).join('')}</div></details>` : '');

    return (
      companyCard(s) +
      apps +
      `<h3>${S.rankingTitle}</h3><ol class="ranking">${ranking}</ol>` +
      `<h3>${S.achievementsTitle} <small>${Object.keys(s.social.achievements).length}/${C.achievements.length} · <span data-v="fol"></span></small></h3><div class="list">${achievements}</div>`
    );
  }

  ui.sheet = {
    structure(s) {
      const tab = ui.view.tab;
      if (tab === 'upgrades') return upgradesSheet(s);
      if (tab === 'company') return companySheet(s);
      return agentsSheet(s);
    },
    values(s) {
      const out = [];
      const tab = ui.view.tab;
      if (tab === 'agents') {
        for (const kind of B.agentOrder) {
          if (B.agents[kind].stage > s.stage) continue;
          const why = core.canBuyAgent(s, kind);
          out.push(['hire:' + kind, { text: why === 'slots' ? S.noDesk : ui.money(core.agentPrice(s, kind)), disabled: !!why }]);
          out.push(['facts:' + kind, agentFacts(s, kind)]);
          out.push(['best:agent:' + kind, ui.timeline.bestTag(s, 'agent:' + kind)]);
        }
        for (const agent of s.agents) {
          const cfg = B.agents[agent.kind];
          const state = ui.agentState(agent);
          out.push(['st:' + agent.id, memberStatus(s, agent)]);
          out.push(['mem:' + agent.id, { toggle: { alert: state === 'full' } }]);
          out.push(['fo:' + agent.id, core.focusActive(s, agent) ? S.focusTag(ui.num(Math.round(agent.focus * 10) / 10), Math.ceil(agent.focusUntil - s.clock.totalSeconds)) : '']);
          if (cfg.context) {
            out.push(['ctx:' + agent.id, { width: pct(core.contextRatio(agent)) }]);
            out.push(['cb:' + agent.id, { disabled: !core.canCompress(s, agent) }]);
          }
        }
      } else if (tab === 'upgrades') {
        for (const key of Object.keys(B.shop)) {
          if ((B.shop[key].stage || 1) > s.stage) continue;
          const why = core.canBuyUpgrade(s, key);
          const level = core.upgradeLevel(s, key);
          out.push(['lv:' + key, key === 'autoCompress' && level === 0 ? S.notOwned : S.level(level)]);
          const label = key === 'autoCompress' && level === 0 ? S.unlock : '';
          out.push(['up:' + key, { text: why === 'max' ? S.maxed : (label ? label + ' · ' : '') + ui.money(core.upgradePrice(s, key)), disabled: !!why }]);
          out.push(['best:up:' + key, why === 'max' ? '' : ui.timeline.bestTag(s, 'up:' + key)]);
        }
      } else {
        const value = core.valuation(s);
        const next = core.nextGrade(value);
        out.push(['val', ui.money(value)]);
        out.push(['gradeNow', next ? S.gradeNowNext(core.exitGrade(value), next.id, ui.money(next.from)) : S.gradeNow(core.exitGrade(value))]);
        out.push(['sell', S.sellCompany(core.exitGrade(value), ui.num(core.exitPoints(s)))]);
        out.push(['fol', S.followers(ui.num(s.social.followers))]);
        for (const r of core.ranking(s)) out.push(['rv:' + r.id, ui.money(r.valuation)]);
        for (const app of s.apps) {
          if (app.status !== 'live') continue;
          out.push(['al:' + app.id, S.liveLine(ui.num(Math.floor(app.users)), ui.money(app.revenue))]);
          out.push(['vt:' + app.id, core.viralApp(s, app) ? S.viralTag : '']);
        }
      }
      return out;
    },
  };

  // Text under the scene: what you are typing and where the code comes from.
  ui.caption = {
    structure(s) {
      const target = core.peekTypingTarget(s);
      const snippet = core.getSnippet(s.typing.snippetId);
      const src = core.snippetSource(snippet);
      const left = target ? S.typingInto(esc(ui.taskName(target.task.name))) : '';
      const right = src ? `${esc(src.pkg)}@${esc(src.version)} · ${esc(src.license)}` : '';
      return `<span>${left}</span><button class="link" data-act="notice" title="${esc(S.footerNotice)}">${right}</button>`;
    },
  };
})(window.Game = window.Game || {});
