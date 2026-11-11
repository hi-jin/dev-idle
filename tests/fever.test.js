'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, typeKeys, finishFirstApp } = require('./helpers');

function inFever() {
  const { G, s } = fresh();
  const out = [];
  G.core.typingTarget(s);
  G.core.advanceCode(s, 'ui');
  G.core.startFever(s, out);
  return { G, s, out };
}

function pressExpected(G, s) {
  const k = G.core.keyForChar(G.core.expectedChar(s));
  return G.core.act(s, { type: 'key', code: k.code, shift: k.shift });
}

test('FR-03: a wrong key writes nothing and breaks the streak', () => {
  const { G, s } = inFever();
  const task = s.apps[0].tasks[0];
  for (let i = 0; i < 5; i++) pressExpected(G, s);
  const progress = task.progress;
  const pos = s.typing.pos;
  const wrong = G.core.expectedChar(s) === 'q' ? 'KeyW' : 'KeyQ';
  G.core.act(s, { type: 'key', code: wrong });
  assert.equal(task.progress, progress);
  assert.equal(s.typing.pos, pos);
  assert.equal(s.caffeine.fever.combo, 0);
  assert.equal(s.caffeine.fever.wrong, 1);
});

test('FR-03: caffeine mode ends after 20 seconds and records characters per minute', () => {
  const { G, s } = inFever();
  for (let i = 0; i < 10; i++) pressExpected(G, s);
  G.core.tick(s, 19.9);
  assert.equal(G.core.feverActive(s), true);
  const out = G.core.tick(s, 0.2);
  const end = out.find((n) => n.type === 'feverEnd');
  assert.ok(end);
  assert.equal(end.correct, 10);
  assert.equal(end.cpm, 30);
  assert.equal(s.stats.bestCpm, 30);
  assert.equal(s.caffeine.fever, null);
});

test('FR-03: caffeine mode accepts up to 20 keys a second', () => {
  const { G, s } = inFever();
  let ok = 0;
  for (let i = 0; i < 30; i++) if (pressExpected(G, s).ok) ok++;
  assert.equal(ok, 20);
});

test('FR-04: an energy drink starts caffeine mode, costs 2 minutes of revenue and needs 3 minutes to recharge', () => {
  const { G, s } = fresh();
  const app = finishFirstApp(G, s);
  if (G.core.feverActive(s)) G.core.tick(s, 21);
  for (let i = 0; i < 600; i++) G.core.tick(s, 0.1);
  assert.ok(Math.abs(G.core.drinkPrice(s) - Math.max(20, app.revenue * 2)) < 1e-9);
  s.money = 1000;
  const price = G.core.drinkPrice(s);
  const { ok, out } = G.core.act(s, { type: 'drink' });
  assert.equal(ok, true);
  assert.ok(out.some((n) => n.type === 'feverStart'));
  assert.ok(Math.abs(s.money - (1000 - price)) < 1e-9);
  assert.equal(G.core.canDrink(s), 'fever');
  G.core.tick(s, 21);
  assert.equal(G.core.canDrink(s), 'cooldown');
  G.core.tick(s, 160);
  assert.equal(G.core.canDrink(s), null);
});

test('typing a whole app in caffeine mode still finishes it', () => {
  const { G, s } = fresh();
  typeKeys(G, s, 900);
  assert.equal(G.core.isReleaseReady(s.apps[0]), true);
  assert.ok(s.stats.fevers >= 1);
});
