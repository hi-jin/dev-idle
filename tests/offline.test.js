'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, plain, finishFirstApp } = require('./helpers');

function busyGame(G, s) {
  finishFirstApp(G, s);
  s.money = 5000;
  G.core.act(s, { type: 'newApp', template: 'photo' });
  G.core.act(s, { type: 'buyAgent', kind: 'bulk' });
  G.core.act(s, { type: 'buyAgent', kind: 'auto' });
}

test('FR-27: an hour away is the same as 360 idle ticks of 10 seconds', () => {
  const a = fresh();
  const b = fresh();
  busyGame(a.G, a.s);
  busyGame(b.G, b.s);
  const sum = a.G.core.runOffline(a.s, 3600);
  for (let i = 0; i < 360; i++) b.G.core.tick(b.s, 10, { idle: true });
  assert.deepEqual(plain(a.s), plain(b.s));
  assert.equal(sum.seconds, 3600);
  assert.ok(sum.earned > 0);
  assert.ok(sum.tasks > 0);
});

test('FR-27: time away stops at 8 hours, and a clock that went back counts as none', () => {
  const { G } = fresh();
  assert.equal(G.core.awaySeconds(1000, 1000 + 3600e3), 3600);
  assert.equal(G.core.awaySeconds(1000, 1000 + 24 * 3600e3), 8 * 3600);
  assert.equal(G.core.awaySeconds(5000, 1000), 0);
  assert.equal(G.core.awaySeconds(0, 1000), 0);
});

test('FR-27: caffeine mode ends when the player leaves', () => {
  const { G, s } = fresh();
  G.core.startFever(s, []);
  G.core.runOffline(s, 600);
  assert.equal(s.caffeine.fever, null);
});
