// The desk scene: the room and robots (SVG), the code on the monitor, the
// developer's typing animation and the floating "+0.25 lines" / "+$12" numbers.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const S = G.strings;

  const KEYWORDS = new Set(
    ('const let var function return if else for while do switch case break continue new this class extends super ' +
      'import export from default try catch finally throw typeof instanceof in of async await yield null undefined ' +
      'true false static get set delete void require module exports').split(' ')
  );
  const TOKEN = /(\/\/[^\n]*)|(\/\*[\s\S]*?(?:\*\/|$))|('(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?|`(?:\\.|[^`\\])*`?)|(\b(?:0x[\da-fA-F]+|\d[\d_]*(?:\.\d+)?)\b)|([A-Za-z_$][\w$]*)/g;
  const MONITOR_LINES = 9;

  // Returns lines, each a list of [class, text] segments.
  function highlight(text) {
    const lines = [[]];
    const push = (cls, chunk) => {
      chunk.split('\n').forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push([cls, part]);
      });
    };
    let last = 0;
    TOKEN.lastIndex = 0;
    let m;
    while ((m = TOKEN.exec(text))) {
      if (m.index > last) push('', text.slice(last, m.index));
      let cls = '';
      if (m[1] || m[2]) cls = 'c';
      else if (m[3]) cls = 's';
      else if (m[4]) cls = 'n';
      else if (m[5] && KEYWORDS.has(m[5])) cls = 'k';
      push(cls, m[0]);
      last = TOKEN.lastIndex;
    }
    if (last < text.length) push('', text.slice(last));
    return lines;
  }

  ui.Scene = function (root) {
    this.root = root;
    root.innerHTML =
      '<div class="scene-art" data-s="art"></div>' +
      '<div class="monitor" data-s="code"></div>' +
      '<div class="down" data-s="down"><b>502</b><span data-s="downText"></span><i class="fire-bar"><i data-s="fireBar"></i></i></div>' +
      '<button class="critter" data-s="critter" hidden aria-label="bug"><span>🐛</span></button>' +
      '<div class="boost-badge" data-s="boost" hidden></div>' +
      '<div class="fever-badge" data-s="fever"></div>' +
      '<div class="floaters" data-s="floaters"></div>' +
      `<div class="scene-hint" data-s="hint"><kbd>A</kbd><span>${ui.esc(S.sceneHint)}</span></div>`;
    this.el = {};
    for (const el of root.querySelectorAll('[data-s]')) this.el[el.dataset.s] = el;
    this.artKey = null;
    this.codeKey = null;
    this.bots = new Map();
    this.hand = 0;
    this.pendingLines = 0;
    this.lastFloat = 0;
  };

  ui.Scene.prototype.update = function (s) {
    const artKey = s.stage + ':' + s.agents.map((a) => a.kind + a.id).join(',');
    if (artKey !== this.artKey) {
      // null on the first drawing, so robots already there when the page opened do not drop in
      const known = this.artKey === null ? null : new Set(this.bots.keys());
      this.artKey = artKey;
      this.el.art.innerHTML = ui.sceneSvg(s.stage, s.agents);
      this.bots.clear();
      for (const el of this.el.art.querySelectorAll('[data-bot]')) {
        this.bots.set(el.dataset.bot, el);
        // a robot hired just now drops in
        if (known && !known.has(el.dataset.bot)) ui.fx.pulse(el, 'arrive', 800);
      }
    }
    for (const agent of s.agents) {
      const el = this.bots.get(agent.id);
      if (!el) continue;
      const state = ui.agentState(agent);
      for (const cls of ['working', 'idle', 'full']) el.classList.toggle(cls, state === cls);
      el.classList.toggle('focus', core.focusActive(s, agent));
    }
    // typing heat: the robots hurry while you type
    const boost = core.heatBoost(s);
    const hot = s.agents.length > 0 && boost >= 1.2;
    this.root.classList.toggle('boosted', hot);
    this.el.boost.hidden = !hot;
    if (hot) this.el.boost.textContent = S.boostBadge(ui.num(Math.round(boost * 10) / 10));
    // a hallucinated bug to squash
    const ev = s.events.current;
    const bug = ev && ev.kind === 'hallucination' ? ev : null;
    // not under the compacting game: the bug waits until it is done
    this.el.critter.hidden = !bug || !!(G.app && G.app.minigame && G.app.minigame.active);
    if (bug) {
      this.el.critter.style.left = bug.x + '%';
      this.el.critter.style.top = bug.y + '%';
    }
    this.el.hint.hidden = s.stats.keys > 0;
    const kind = core.feverKind(s);
    this.root.classList.toggle('fever', !!kind);
    this.el.fever.hidden = !kind;
    if (kind === 'typing') this.el.fever.textContent = S.feverBadge(ui.num(core.feverMultiplier(s)), s.caffeine.fever.combo, ui.view.touch);
    else if (kind === 'prompt') this.el.fever.textContent = S.badgePrompt(s.caffeine.fever.prompts);
    else if (kind === 'review') this.el.fever.textContent = S.badgeReview(s.caffeine.fever.bugs);
    const down = core.inOutage(s);
    this.el.down.hidden = !down;
    this.root.classList.toggle('on-fire', down);
    if (down) {
      this.el.downText.textContent = ui.view.touch ? S.fireSceneTouch : S.fireScene;
      this.el.fireBar.style.width = Math.min(100, (s.outage.keys / s.outage.goal) * 100) + '%';
    }
    this.updateCode(s);
  };

  // After a language switch; the code on the monitor redraws on the next update.
  ui.Scene.prototype.relabel = function () {
    const hint = this.el.hint.querySelector('span');
    if (hint) hint.textContent = S.sceneHint;
    this.codeKey = null;
  };

  // What a robot is doing right now, for its look and its status line.
  ui.agentState = function (agent) {
    if (agent.full) return 'full';
    return agent.taskIds.length ? 'working' : 'idle';
  };

  // The agent id of the robot under a pointer, if any.
  ui.Scene.prototype.botAt = function (target) {
    const el = target.closest && target.closest('[data-bot]');
    return el ? el.dataset.bot : null;
  };

  ui.Scene.prototype.updateCode = function (s) {
    const ty = s.typing;
    const kind = core.feverKind(s);
    if (kind === 'prompt' || kind === 'review') {
      this.updateFeverScreen(s, kind);
      return;
    }
    const fever = kind === 'typing';
    const key = ty.snippetId + ':' + ty.pos + ':' + fever;
    if (key === this.codeKey) return;
    this.codeKey = key;
    this.el.code.className = 'monitor';
    const snippet = core.getSnippet(ty.snippetId);
    if (!snippet) {
      this.el.code.innerHTML = '<div class="ln"><i class="caret"></i></div>';
      return;
    }
    const lines = highlight(snippet.text.slice(0, ty.pos));
    // A long line would push the cursor out of the monitor, so only its
    // last characters show: in caffeine mode the marked key must stay in view.
    const lineStart = snippet.text.lastIndexOf('\n', ty.pos - 1) + 1;
    const keep = fever ? 10 : 20;
    if (ty.pos - lineStart > keep) lines[lines.length - 1] = [['c', '…']].concat(highlight(snippet.text.slice(ty.pos - keep, ty.pos))[0] || []);
    const from = Math.max(0, lines.length - MONITOR_LINES);
    let html = '';
    // In caffeine mode the next character is marked and the rest of the line shows faintly.
    let tail = '<i class="caret"></i>';
    if (fever) {
      const rest = snippet.text.slice(ty.pos).split('\n')[0];
      tail = rest ? `<span class="want">${ui.esc(rest[0])}</span><span class="ahead">${ui.esc(rest.slice(1, 14))}</span>` : tail;
    }
    for (let i = from; i < lines.length; i++) {
      const segs = lines[i].map(([cls, t]) => (cls ? `<span class="${cls}">${ui.esc(t)}</span>` : ui.esc(t))).join('');
      html += `<div class="ln">${segs}${i === lines.length - 1 ? tail : ''}</div>`;
    }
    this.el.code.innerHTML = html;
  };

  // Prompt mode shows the prompt as a chat box; review mode shows the change
  // being reviewed. The card's buttons are under the scene.
  ui.Scene.prototype.updateFeverScreen = function (s, kind) {
    const f = s.caffeine.fever;
    const ready = core.feverReady(s);
    const key = kind + ':' + ready + ':' + (kind === 'prompt' ? f.promptIndex + ':' + f.cursor : f.cardIndex + ':' + (core.reviewWait(s) > 0));
    if (key === this.codeKey) return;
    this.codeKey = key;
    let html = '';
    if (kind === 'prompt') {
      const text = core.promptText(s);
      const done = ready ? text.slice(0, f.cursor) : '';
      const want = ready ? text[f.cursor] || '' : '';
      const ahead = ready ? text.slice(f.cursor + 1) : text;
      html =
        `<div class="ln to">&gt; ${ui.esc(S.promptTo)}</div>` +
        `<div class="ln say">${ui.esc(done)}<span class="want">${want === ' ' ? '&nbsp;' : ui.esc(want)}</span><span class="ahead">${ui.esc(ahead)}</span></div>`;
    } else if (core.reviewWait(s) > 0) {
      html = `<div class="ln to">${ui.esc(S.getReady)}</div>`;
    } else {
      const card = core.reviewCard(s);
      const cls = { '+': 'add', '-': 'del' };
      html = `<div class="ln to">${ui.esc(card.file)}</div>` + card.lines.map((line) => `<div class="ln ${cls[line[0]] || ''}">${ui.esc(line)}</div>`).join('');
    }
    this.el.code.className = 'monitor on-' + kind;
    this.el.code.innerHTML = html;
  };

  // Called for every accepted key: move a hand and show the lines written.
  ui.Scene.prototype.typed = function (lines) {
    const dev = this.el.art.querySelector('.dev');
    if (dev) {
      this.hand = 1 - this.hand;
      // Alternating classes restarts the press animation on every key.
      dev.classList.remove('tap-l', 'tap-r');
      dev.classList.add(this.hand ? 'tap-l' : 'tap-r');
    }
    this.pendingLines += lines;
    const now = performance.now();
    if (now - this.lastFloat > 140) {
      this.lastFloat = now;
      this.float(S.linesFloat(ui.num(this.pendingLines)), 'lines', 46 + Math.random() * 14, 14);
      this.pendingLines = 0;
    }
  };

  ui.Scene.prototype.earned = function (amount) {
    if (amount > 0) this.float('+' + ui.money(amount), 'cash', 10 + Math.random() * 12, 16);
  };

  ui.Scene.prototype.oops = function (agentId) {
    const el = this.bots.get(agentId);
    if (!el) return;
    el.classList.add('oops');
    setTimeout(() => el.classList.remove('oops'), 1400);
  };

  ui.Scene.prototype.float = function (text, cls, leftPct, topPct) {
    const el = document.createElement('span');
    el.className = 'floater ' + cls;
    el.textContent = text;
    el.style.left = leftPct + '%';
    el.style.top = topPct + '%';
    this.el.floaters.appendChild(el);
    while (this.el.floaters.children.length > 12) this.el.floaters.firstChild.remove();
    setTimeout(() => el.remove(), 1100);
  };
})(window.Game = window.Game || {});
