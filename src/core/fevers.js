// Caffeine mode: starting and ending it, and its two later kinds (spec 6.1).
// Typing mode itself is in typing.js. From stage 3 the player picks the kind of
// the next round: prompt mode (FR-05) makes every agent more accurate for a
// while, review mode (FR-06) catches bugs for bonus cash and empties the bug gauge.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;
  const C = G.content;

  core.FEVER_KINDS = ['typing', 'prompt', 'review'];

  core.feverUnlocked = function (s, kind) {
    return B.feverKinds[kind] != null && s.stage >= B.feverKinds[kind];
  };

  core.setFeverKind = function (s, kind) {
    if (!core.feverUnlocked(s, kind)) return false;
    s.caffeine.next = kind;
    return true;
  };

  // The kind the next round starts as. A new company starts at stage 1 again,
  // so a choice that is locked there falls back to typing.
  core.nextFeverKind = function (s) {
    return core.feverUnlocked(s, s.caffeine.next) ? s.caffeine.next : 'typing';
  };

  core.feverActive = function (s) {
    const f = s.caffeine.fever;
    return !!f && f.endsAt > s.clock.totalSeconds;
  };

  core.feverKind = function (s) {
    return core.feverActive(s) ? s.caffeine.fever.kind || 'typing' : null;
  };

  // Prompt and review mode wait a second before they take input.
  core.feverReady = function (s) {
    const f = s.caffeine.fever;
    return !!f && !(f.readyAt > s.clock.totalSeconds);
  };

  core.startFever = function (s, out, kind) {
    const k = kind || core.nextFeverKind(s);
    const now = s.clock.totalSeconds;
    const f = { kind: k, endsAt: now + B.typing.feverSeconds, combo: 0, correct: 0, wrong: 0 };
    if (k === 'prompt') Object.assign(f, { readyAt: now + B.prompt.readySeconds, promptIndex: -1, cursor: 0, typos: 0, prompts: 0 });
    if (k === 'review') Object.assign(f, { readyAt: now + B.review.readySeconds, cardIndex: -1, cardAt: 0, cards: 0, bugs: 0, fixed: 0, cash: 0, last: null });
    s.caffeine.gauge = 0;
    s.caffeine.fever = f;
    if (k === 'prompt') newPrompt(s, f);
    if (k === 'review') newCard(s, f, B.review.readySeconds);
    s.stats.fevers += 1;
    out.push({ type: 'feverStart', kind: k });
  };

  core.endFever = function (s, out) {
    const f = s.caffeine.fever;
    if (!f) return;
    const kind = f.kind || 'typing';
    s.caffeine.fever = null;
    const note = { type: 'feverEnd', kind, correct: f.correct, wrong: f.wrong };
    if (kind === 'review') {
      Object.assign(note, { cards: f.cards, bugs: f.bugs, fixed: f.fixed, cash: f.cash });
    } else {
      const seconds = B.typing.feverSeconds - (kind === 'prompt' ? B.prompt.readySeconds : 0);
      note.cpm = Math.round((f.correct / seconds) * 60);
      s.stats.bestCpm = Math.max(s.stats.bestCpm, note.cpm);
      if (kind === 'prompt') Object.assign(note, { prompts: f.prompts, boost: core.promptBoost(s) });
    }
    out.push(note);
  };

  core.tickFever = function (s, out) {
    if (s.caffeine.fever && !core.feverActive(s)) core.endFever(s, out);
  };

  // A random entry of list other than the one at `last`.
  function pickOther(s, list, last) {
    const i = Math.floor(G.rng.next(s) * list.length);
    return i === last ? (i + 1) % list.length : i;
  }

  // ---------- prompt mode (FR-05) ----------

  function newPrompt(s, f) {
    f.promptIndex = pickOther(s, C.prompts, f.promptIndex);
    f.cursor = 0;
    f.typos = 0;
  }

  core.promptText = function (s) {
    const f = s.caffeine.fever;
    return f && f.kind === 'prompt' ? C.prompts[f.promptIndex] : null;
  };

  // Success chance every agent gets from prompts finished in the last 2 minutes.
  core.promptBoost = function (s) {
    const b = s.caffeine.boost;
    return b.until > s.clock.totalSeconds ? b.value : 0;
  };

  core.promptBoostLeft = function (s) {
    return Math.max(0, s.caffeine.boost.until - s.clock.totalSeconds);
  };

  // A finished prompt adds 2 points, or 1 with three or more typos, and every
  // prompt restarts the 2 minutes for the whole boost.
  function finishPrompt(s, f, out) {
    const P = B.prompt;
    const gain = f.typos >= P.sloppyTypos ? P.sloppy : P.perPrompt;
    const b = s.caffeine.boost;
    b.value = Math.min(P.max, core.promptBoost(s) + gain);
    b.until = s.clock.totalSeconds + P.seconds;
    f.prompts += 1;
    s.stats.prompts += 1;
    out.push({ type: 'promptDone', gain, boost: b.value, typos: f.typos });
    newPrompt(s, f);
  }

  function promptAdvance(s, f, n, out) {
    f.cursor += n;
    f.correct += n;
    f.combo += n;
    if (f.cursor >= core.promptText(s).length) finishPrompt(s, f, out);
  }

  function promptMiss(f) {
    f.typos += 1;
    f.wrong += 1;
    f.combo = 0;
  }

  core.promptKey = function (s, code, shift, out) {
    if (!core.feverReady(s) || !core.acceptKey(s, B.typing.feverMaxKeysPerSecond)) return false;
    const f = s.caffeine.fever;
    s.typing.lastLines = 0;
    if (core.keyMatchesChar(core.promptText(s)[f.cursor], code, shift)) promptAdvance(s, f, 1, out);
    else promptMiss(f);
    return true;
  };

  // On touch screens: the next word and two other words of the same prompt.
  // Like the typing choices, they come from the cursor alone, with no random numbers.
  core.promptChoices = function (s) {
    if (!core.feverReady(s)) return null;
    const f = s.caffeine.fever;
    const text = core.promptText(s);
    const m = /^\s*\S+\s?/.exec(text.slice(f.cursor));
    if (!m) return null;
    const right = m[0];
    const word = right.trim();
    const words = text.split(/\s+/);
    const start = (f.cursor * 7 + f.promptIndex) % words.length;
    const decoys = [];
    for (let k = 1; decoys.length < 2 && k < words.length; k++) {
      const w = words[(start + k) % words.length];
      if (w !== word && !decoys.includes(w)) decoys.push(w);
    }
    while (decoys.length < 2) decoys.push(word.split('').reverse().join('') + '-'.repeat(decoys.length + 1));
    const answer = (f.cursor + f.promptIndex) % 3;
    const options = decoys.slice();
    options.splice(answer, 0, word);
    return { options, answer, chars: right.length };
  };

  core.pickPrompt = function (s, index, out) {
    const choices = core.promptChoices(s);
    if (!choices || !core.acceptKey(s, B.typing.feverMaxKeysPerSecond)) return false;
    const f = s.caffeine.fever;
    s.typing.lastLines = 0;
    if (index === choices.answer) promptAdvance(s, f, choices.chars, out);
    else promptMiss(f);
    return true;
  };

  // ---------- review mode (FR-06) ----------

  // A wrong answer holds the next card back for a few seconds, which is also
  // the time to read why.
  function newCard(s, f, wait) {
    f.cardIndex = pickOther(s, C.reviews, f.cardIndex);
    f.cardAt = s.clock.totalSeconds + wait;
  }

  core.reviewCard = function (s) {
    const f = s.caffeine.fever;
    return f && f.kind === 'review' ? C.reviews[f.cardIndex] : null;
  };

  // Seconds until the current card can be answered.
  core.reviewWait = function (s) {
    const f = s.caffeine.fever;
    return f && f.kind === 'review' ? Math.max(0, f.cardAt - s.clock.totalSeconds) : 0;
  };

  core.reviewLast = function (s) {
    const f = s.caffeine.fever;
    if (!f || !f.last) return null;
    const card = C.reviews.find((c) => c.id === f.last.cardId);
    return card ? Object.assign({ card }, f.last) : null;
  };

  // Bonus cash worth some seconds of revenue. Like other bonus cash it does
  // not count toward the stage goals.
  function bonus(s, seconds) {
    const cash = (core.steadyRevenue(s) / 60) * seconds;
    s.money += cash;
    return cash;
  }

  // choice: the index of the line with the bug, or 'ok' for "Looks good".
  core.answerReview = function (s, choice, out) {
    const card = core.reviewCard(s);
    if (!card || core.reviewWait(s) > 0) return false;
    const said = choice === 'ok' ? null : Number(choice);
    if (said !== null && !(Number.isInteger(said) && said >= 0 && said < card.lines.length)) return false;
    const R = B.review;
    const f = s.caffeine.fever;
    const right = said === card.bug;
    const note = { type: 'reviewed', cardId: card.id, right, bug: card.bug, cash: 0, fixed: false };
    f.cards += 1;
    s.stats.reviewCards += 1;
    if (right && card.bug !== null) {
      f.bugs += 1;
      s.stats.bugsFoundInReview += 1;
      // a bug caught in review comes off the gauge
      if (s.bugs > 0 && !core.inOutage(s)) {
        s.bugs = Math.max(0, s.bugs - R.bugs);
        f.fixed += 1;
        note.fixed = true;
      }
      note.cash = bonus(s, R.bugRevenueSeconds);
    } else if (right) {
      note.cash = bonus(s, R.cleanRevenueSeconds);
    }
    if (right) f.correct += 1;
    else f.wrong += 1;
    f.cash += note.cash;
    f.last = { cardId: card.id, choice: said, right };
    newCard(s, f, right ? 0 : R.wrongSeconds);
    out.push(note);
    return true;
  };

  // Keys 1 to 8 pick a line; Enter or 0 says "Looks good". Other keys do nothing.
  core.reviewKey = function (s, code, out) {
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Digit0' || code === 'Numpad0') return core.answerReview(s, 'ok', out);
    const m = /^(?:Digit|Numpad)([1-8])$/.exec(code);
    return m ? core.answerReview(s, Number(m[1]) - 1, out) : false;
  };
})(window.Game = window.Game || {});
