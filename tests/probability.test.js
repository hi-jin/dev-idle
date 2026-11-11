'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, finishFirstApp } = require('./helpers');

test('FR-09: the base chance comes from the agent table', () => {
  const { G, s } = fresh();
  assert.equal(G.core.successChance(s, { kind: 'bulk' }, 1), 0.95);
  assert.equal(G.core.successChance(s, { kind: 'precise' }, 4), 0.7);
});

test('FR-09: over many rolls the success rate matches the chance', () => {
  const { G, s } = fresh();
  const agent = { kind: 'bulk', failStreak: 0, done: 0, failed: 0 };
  let ok = 0;
  const n = 20000;
  for (let i = 0; i < n; i++) if (G.rng.next(s) < G.core.successChance(s, agent, 3)) ok++;
  assert.ok(Math.abs(ok / n - 0.6) < 0.015, `rate ${ok / n}`);
});
