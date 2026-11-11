'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./helpers');

function inPrompt() {
  const { G, s } = fresh();
  s.stage = 3;
  const out = [];
  G.core.startFever(s, out, 'prompt');
  G.core.tick(s, 1);
  return { G, s, out };
}

function typeChar(G, s, ch) {
  const k = G.core.keyForChar(ch);
  return G.core.act(s, { type: 'key', code: k.code, shift: k.shift });
}

// Types the rest of the prompt, with `typos` wrong keys first, about 16 keys a
// second so the per-second limit never applies.
function finishPrompt(G, s, typos) {
  const f = s.caffeine.fever;
  const text = G.core.promptText(s);
  const notes = [];
  for (let i = 0; i < (typos || 0); i++) {
    G.core.tick(s, 0.06);
    G.core.act(s, { type: 'key', code: text[f.cursor] === 'q' ? 'KeyW' : 'KeyQ' });
  }
  for (let i = f.cursor; i < text.length; i++) {
    G.core.tick(s, 0.06);
    notes.push(...typeChar(G, s, text[i]).out);
  }
  return notes;
}

test('FR-05: prompt mode can be picked from stage 3, and the gauge then starts it', () => {
  const { G, s } = fresh();
  s.stage = 2;
  assert.equal(G.core.act(s, { type: 'feverKind', kind: 'prompt' }).ok, false);
  s.stage = 3;
  assert.equal(G.core.act(s, { type: 'feverKind', kind: 'prompt' }).ok, true);
  assert.equal(G.core.act(s, { type: 'feverKind', kind: 'review' }).ok, false);
  s.caffeine.gauge = 399;
  const { out } = G.core.act(s, { type: 'key', code: 'KeyA' });
  assert.ok(out.some((n) => n.type === 'feverStart' && n.kind === 'prompt'));
  assert.equal(G.core.feverKind(s), 'prompt');
  assert.ok(G.core.promptText(s).length >= 30);
});

test('FR-05: a new company starts at stage 1, so the next round falls back to typing', () => {
  const { G, s } = fresh();
  s.stage = 3;
  G.core.setFeverKind(s, 'prompt');
  s.stage = 1;
  assert.equal(G.core.nextFeverKind(s), 'typing');
});

test('FR-05: keys in the first second do not count, then right keys move through the prompt', () => {
  const { G, s } = fresh();
  s.stage = 3;
  G.core.startFever(s, [], 'prompt');
  const keys = s.stats.keys;
  assert.equal(G.core.act(s, { type: 'key', code: 'KeyQ' }).ok, false);
  assert.equal(s.stats.keys, keys);
  assert.equal(s.caffeine.fever.typos, 0);
  G.core.tick(s, 1);
  const text = G.core.promptText(s);
  typeChar(G, s, text[0]);
  typeChar(G, s, text[1]);
  assert.equal(s.caffeine.fever.cursor, 2);
  const wrong = text[2] === 'q' ? 'KeyW' : 'KeyQ';
  G.core.act(s, { type: 'key', code: wrong });
  assert.equal(s.caffeine.fever.cursor, 2);
  assert.equal(s.caffeine.fever.typos, 1);
  assert.equal(s.caffeine.fever.combo, 0);
});

test('FR-05: a finished prompt gives every agent +2 points for 2 minutes', () => {
  const { G, s } = inPrompt();
  const before = G.core.successChance(s, { kind: 'bulk' }, 3);
  const first = G.core.promptText(s);
  const notes = finishPrompt(G, s, 0);
  assert.ok(notes.some((n) => n.type === 'promptDone' && n.gain === 0.02));
  assert.equal(s.caffeine.fever.prompts, 1);
  assert.equal(s.stats.prompts, 1);
  assert.notEqual(G.core.promptText(s), first, 'a new prompt follows');
  assert.equal(s.caffeine.fever.cursor, 0);
  assert.ok(Math.abs(G.core.promptBoost(s) - 0.02) < 1e-9);
  assert.ok(Math.abs(G.core.successChance(s, { kind: 'bulk' }, 3) - before - 0.02) < 1e-9);
  G.core.tick(s, 119);
  assert.ok(G.core.promptBoost(s) > 0);
  G.core.tick(s, 1.1);
  assert.equal(G.core.promptBoost(s), 0);
});

test('FR-05: three typos make a prompt worth 1 point, and the boost stops at 10 points', () => {
  const { G, s } = inPrompt();
  finishPrompt(G, s, 3);
  assert.ok(Math.abs(G.core.promptBoost(s) - 0.01) < 1e-9);
  s.caffeine.boost.value = 0.095;
  finishPrompt(G, s, 0);
  assert.ok(Math.abs(G.core.promptBoost(s) - 0.1) < 1e-9);
});

test('FR-05: prompt mode writes no code, ignores taps, and reports prompts at the end', () => {
  const { G, s } = inPrompt();
  const task = s.apps[0].tasks[0];
  finishPrompt(G, s, 0);
  assert.equal(task.progress, 0);
  assert.equal(G.core.act(s, { type: 'tap' }).ok, false);
  const out = G.core.tick(s, 20);
  const end = out.find((n) => n.type === 'feverEnd');
  assert.equal(end.kind, 'prompt');
  assert.equal(end.prompts, 1);
  assert.ok(Math.abs(end.boost - 0.02) < 1e-9);
  assert.ok(end.cpm > 0);
});

test('FR-05, FR-30: on touch screens the next word is one of three, and picking it types the word', () => {
  const { G, s } = inPrompt();
  const text = G.core.promptText(s);
  const choices = G.core.feverChoices(s);
  assert.equal(choices.options.length, 3);
  assert.equal(new Set(choices.options).size, 3);
  const firstWord = text.split(' ')[0];
  assert.equal(choices.options[choices.answer], firstWord);
  assert.deepEqual(G.core.feverChoices(s), choices, 'the same cursor gives the same choices');
  G.core.act(s, { type: 'pick', index: (choices.answer + 1) % 3 });
  assert.equal(s.caffeine.fever.typos, 1);
  assert.equal(s.caffeine.fever.cursor, 0);
  G.core.act(s, { type: 'pick', index: choices.answer });
  assert.equal(s.caffeine.fever.cursor, firstWord.length + 1);
});
