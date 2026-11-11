// Typing by hand: any key writes the next characters of an open-source snippet
// and adds code to the selected task (FR-01, FR-02). Caffeine mode asks for the
// exact next character and multiplies the code it writes (FR-03). Starting and
// ending caffeine mode, and the prompt and review modes, are in fevers.js.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  // Compared by KeyboardEvent.code (physical key), so the Korean IME state does not matter.
  const TYPING_KEY = /^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Space|Enter|NumpadEnter|Backspace|Minus|Equal|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Backquote)$/;

  const PLAIN = {
    '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash',
    ';': 'Semicolon', "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', ' ': 'Space', '\n': 'Enter',
  };
  const SHIFTED = {
    '~': 'Backquote', '!': 'Digit1', '@': 'Digit2', '#': 'Digit3', '$': 'Digit4', '%': 'Digit5', '^': 'Digit6',
    '&': 'Digit7', '*': 'Digit8', '(': 'Digit9', ')': 'Digit0', '_': 'Minus', '+': 'Equal', '{': 'BracketLeft',
    '}': 'BracketRight', '|': 'Backslash', ':': 'Semicolon', '"': 'Quote', '<': 'Comma', '>': 'Period', '?': 'Slash',
  };

  core.isTypingKey = function (code) {
    return TYPING_KEY.test(code || '');
  };

  core.keyForChar = function (ch) {
    if (/^[a-z]$/.test(ch)) return { code: 'Key' + ch.toUpperCase(), shift: false };
    if (/^[A-Z]$/.test(ch)) return { code: 'Key' + ch, shift: true };
    if (/^[0-9]$/.test(ch)) return { code: 'Digit' + ch, shift: false };
    if (PLAIN[ch]) return { code: PLAIN[ch], shift: false };
    if (SHIFTED[ch]) return { code: SHIFTED[ch], shift: true };
    return null;
  };

  // Used by caffeine mode. Letters ignore Shift so Caps Lock is forgiven.
  core.keyMatchesChar = function (ch, code, shift) {
    const k = core.keyForChar(ch);
    if (!k) return false;
    if (/^[a-zA-Z]$/.test(ch)) return code === k.code;
    if (/^[0-9]$/.test(ch)) return code === k.code || code === 'Numpad' + ch;
    if (ch === '\n') return code === 'Enter' || code === 'NumpadEnter';
    return code === k.code && !!shift === k.shift;
  };

  core.linesPerKey = function (s) {
    const bonus = (1 + core.bonus(s, 'typing')) * (1 + B.exit.typingPerPoint * s.prestige.points);
    return B.typing.linesPerKey * Math.pow(B.typing.skillMultiplier, s.dev.typing) * bonus;
  };

  core.snippetList = function () {
    const dump = G.codeDump;
    return dump && dump.snippets && dump.snippets.length ? dump.snippets : [G.content.fallbackSnippet];
  };

  core.getSnippet = function (id) {
    const dump = G.codeDump;
    if (dump && dump.snippets) {
      if (!dump.byId) {
        dump.byId = {};
        for (const sn of dump.snippets) dump.byId[sn.id] = sn;
      }
      if (dump.byId[id]) return dump.byId[id];
    }
    return id === G.content.fallbackSnippet.id ? G.content.fallbackSnippet : null;
  };

  core.snippetSource = function (snippet) {
    const dump = G.codeDump;
    return snippet && dump && dump.sources ? dump.sources[snippet.src] || null : null;
  };

  core.pickSnippet = function (s, tag) {
    const all = core.snippetList();
    let pool = all.filter((x) => x.tag === tag);
    if (!pool.length) pool = all.filter((x) => x.tag === 'general');
    if (!pool.length) pool = all;
    return G.rng.pick(s, pool);
  };

  // Moves the cursor past charsPerKey visible characters, then past any whitespace,
  // so the caret always rests on the next real character.
  core.advanceCode = function (s, tag) {
    const ty = s.typing;
    let snippet = core.getSnippet(ty.snippetId);
    if (!snippet || ty.pos >= snippet.text.length) {
      snippet = core.pickSnippet(s, tag);
      ty.snippetId = snippet.id;
      ty.pos = 0;
    }
    const text = snippet.text;
    let left = B.typing.charsPerKey;
    while (ty.pos < text.length && left > 0) {
      if (!/\s/.test(text[ty.pos])) left -= 1;
      ty.pos += 1;
    }
    while (ty.pos < text.length && /\s/.test(text[ty.pos])) ty.pos += 1;
  };

  // The selected task, else a task of the app being built (one nobody is on
  // first), else an update.
  // Does not change the state, so the interface can show it before the first key.
  core.peekTypingTarget = function (s) {
    const cur = core.findTask(s, s.typing.taskId);
    if (cur && !cur.task.done) return cur;
    // the app being built comes first; updates of live apps only after it
    const apps = s.apps.filter((a) => a.status === 'building').concat(s.apps.filter((a) => a.status !== 'building'));
    for (const app of apps) {
      for (const includeAssigned of [false, true]) {
        for (const task of app.tasks) {
          if (!task.done && (includeAssigned || !task.assignee)) return { app, task };
        }
      }
    }
    return null;
  };

  core.typingTarget = function (s) {
    const target = core.peekTypingTarget(s);
    s.typing.taskId = target ? target.task.id : null;
    return target;
  };

  core.setTypingTask = function (s, taskId) {
    const found = core.findTask(s, taskId);
    if (!found || found.task.done) return false;
    s.typing.taskId = taskId;
    return true;
  };

  core.feverMultiplier = function (s) {
    const T = B.typing;
    const f = s.caffeine.fever;
    return Math.min(T.feverMax, T.feverBase + T.feverComboBonus * Math.floor((f ? f.combo : 0) / T.feverComboStep));
  };

  // The snippet under the cursor, switching to a new one when this one is used up.
  function currentSnippet(s, tag) {
    const ty = s.typing;
    let snippet = core.getSnippet(ty.snippetId);
    if (!snippet || ty.pos >= snippet.text.length) {
      snippet = core.pickSnippet(s, tag);
      ty.snippetId = snippet.id;
      ty.pos = 0;
    }
    while (ty.pos < snippet.text.length && /\s/.test(snippet.text[ty.pos])) ty.pos += 1;
    return snippet;
  }

  // The character caffeine mode asks for next.
  core.expectedChar = function (s) {
    const snippet = core.getSnippet(s.typing.snippetId);
    return snippet ? snippet.text[s.typing.pos] || null : null;
  };

  function stepOneChar(s, snippet) {
    const ty = s.typing;
    ty.pos += 1;
    while (ty.pos < snippet.text.length && /\s/.test(snippet.text[ty.pos])) ty.pos += 1;
  }

  // Counts one key (or pick) against the per-second limit; false when over it.
  core.acceptKey = function (s, max) {
    const ty = s.typing;
    const bucket = Math.floor(s.clock.totalSeconds);
    if (bucket !== ty.bucket) {
      ty.bucket = bucket;
      ty.bucketKeys = 0;
    }
    if (ty.bucketKeys >= max) return false;
    ty.bucketKeys += 1;
    s.stats.keys += 1;
    // every key hurries the agents
    ty.heat = Math.min(B.heat.max, (ty.heat || 0) + B.heat.perKey);
    return true;
  };

  // Shared by keys and taps. `code` is null for a tap: in caffeine mode a tap
  // writes one character at the normal rate, so touch screens are not stuck.
  function typeOnce(s, code, shift, out) {
    const ty = s.typing;
    const fever = core.feverActive(s);
    if (!core.acceptKey(s, fever ? B.typing.feverMaxKeysPerSecond : B.typing.maxKeysPerSecond)) return false;

    const target = core.typingTarget(s);
    const tag = target ? target.task.tag : 'general';
    let lines = core.linesPerKey(s);
    if (fever) {
      const f = s.caffeine.fever;
      const snippet = currentSnippet(s, tag);
      if (code !== null) {
        if (!core.keyMatchesChar(snippet.text[ty.pos], code, shift)) {
          f.combo = 0;
          f.wrong += 1;
          ty.lastLines = 0;
          return true;
        }
        f.combo += 1;
        f.correct += 1;
        lines *= core.feverMultiplier(s);
      }
      stepOneChar(s, snippet);
    } else {
      core.advanceCode(s, tag);
      s.caffeine.gauge += 1;
      if (s.caffeine.gauge >= B.typing.gaugeMax) core.startFever(s, out);
    }
    ty.lastLines = target ? lines : 0;
    // for the growth chart: a caffeine key counts as the several keys it is worth
    if (s.log) s.log.eff += lines / core.linesPerKey(s);
    if (target) {
      // Helping an agent speeds its task up, but the agent's roll still decides it.
      const agent = target.task.assignee ? core.findAgent(s, target.task.assignee) : null;
      core.addProgress(s, target.app, target.task, lines, agent, out);
    }
    return true;
  }

  // ---------- touch screens in caffeine mode (FR-30) ----------

  // The next few characters, skipping spaces, starting at pos.
  function chunkAt(text, pos, n) {
    let p = pos;
    let chunk = '';
    while (p < text.length && chunk.length < n) {
      if (!/\s/.test(text[p])) chunk += text[p];
      p += 1;
    }
    return chunk;
  }

  // Three pieces of code to choose from: the one that comes next and two from
  // elsewhere in the snippet. Worked out from the cursor alone, so the choices
  // stay the same between screen updates and use no random numbers.
  core.feverChoices = function (s) {
    const kind = core.feverKind(s);
    if (kind === 'prompt') return core.promptChoices(s);
    if (kind !== 'typing') return null;
    const snippet = core.getSnippet(s.typing.snippetId);
    if (!snippet) return null;
    const n = B.typing.chunkChars;
    const text = snippet.text;
    const pos = s.typing.pos;
    const right = chunkAt(text, pos, n);
    if (!right) return null;
    const decoys = [];
    for (let k = 1; decoys.length < 2 && k < 40; k++) {
      const c = chunkAt(text, (pos * 7 + k * 101) % text.length, n);
      if (c.length === right.length && c !== right && !decoys.includes(c)) decoys.push(c);
    }
    while (decoys.length < 2) decoys.push(right.split('').reverse().join('') + '_'.repeat(decoys.length));
    const answer = pos % 3;
    const options = decoys.slice();
    options.splice(answer, 0, right);
    return { options, answer };
  };

  // Picking the right piece types all of its characters in caffeine mode at
  // once; a wrong one breaks the streak like a wrong key.
  core.pickChunk = function (s, index, out) {
    if (core.feverKind(s) === 'prompt') return core.pickPrompt(s, index, out);
    const choices = core.feverChoices(s);
    if (!choices) return false;
    const ty = s.typing;
    if (!core.acceptKey(s, B.typing.feverMaxKeysPerSecond)) return false;
    const f = s.caffeine.fever;
    if (index !== choices.answer) {
      f.combo = 0;
      f.wrong += 1;
      ty.lastLines = 0;
      return true;
    }
    const target = core.typingTarget(s);
    const snippet = currentSnippet(s, target ? target.task.tag : 'general');
    let lines = 0;
    for (let i = 0; i < choices.options[index].length; i++) {
      f.combo += 1;
      f.correct += 1;
      lines += core.linesPerKey(s) * core.feverMultiplier(s);
      stepOneChar(s, snippet);
    }
    ty.lastLines = target ? lines : 0;
    if (s.log) s.log.eff += lines / core.linesPerKey(s);
    if (target) {
      const agent = target.task.assignee ? core.findAgent(s, target.task.assignee) : null;
      core.addProgress(s, target.app, target.task, lines, agent, out);
    }
    return true;
  };

  core.pressKey = function (s, code, out, shift) {
    if (!core.isTypingKey(code)) return false;
    const kind = core.feverKind(s);
    if (kind === 'prompt') return core.promptKey(s, code, shift, out);
    if (kind === 'review') return core.reviewKey(s, code, out);
    return typeOnce(s, code, shift, out);
  };

  // Prompt and review mode are played with keys or their own buttons, not the desk.
  core.tap = function (s, out) {
    const kind = core.feverKind(s);
    if (kind === 'prompt' || kind === 'review') return false;
    return typeOnce(s, null, false, out);
  };
})(window.Game = window.Game || {});
