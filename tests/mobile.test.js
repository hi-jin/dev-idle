'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh } = require('./helpers');

function feverGame() {
  const { G, s } = fresh();
  G.core.act(s, { type: 'tap' });
  G.core.startFever(s, []);
  G.core.tick(s, 0.1);
  return { G, s };
}

test('FR-30: caffeine mode on a touch screen offers three pieces, one of them next in the code', () => {
  const { G, s } = fresh();
  assert.equal(G.core.feverChoices(s), null, 'only in caffeine mode');
  const game = feverGame();
  game.G.core.act(game.s, { type: 'tap' });
  const c = game.G.core.feverChoices(game.s);
  assert.equal(c.options.length, 3);
  assert.equal(new Set(c.options).size, 3);
  const snippet = game.G.core.getSnippet(game.s.typing.snippetId);
  const next = snippet.text.slice(game.s.typing.pos).replace(/\s/g, '').slice(0, 4);
  assert.equal(c.options[c.answer], next);
  assert.deepEqual(game.G.core.feverChoices(game.s), c, 'the same choices until something is picked');
});

test('FR-30: the right piece types four characters at the caffeine rate, a wrong one breaks the streak', () => {
  const { G, s } = feverGame();
  const task = G.core.typingTarget(s).task;
  const before = task.progress;
  const c = G.core.feverChoices(s);
  assert.equal(G.core.act(s, { type: 'pick', index: c.answer }).ok, true);
  assert.equal(s.caffeine.fever.combo, 4);
  assert.ok(Math.abs(task.progress - before - 4 * G.core.linesPerKey(s) * 5) < 1e-9);
  const next = G.core.feverChoices(s);
  G.core.act(s, { type: 'pick', index: (next.answer + 1) % 3 });
  assert.equal(s.caffeine.fever.combo, 0);
  assert.equal(s.caffeine.fever.wrong, 1);
});
