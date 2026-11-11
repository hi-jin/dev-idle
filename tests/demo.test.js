'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

function demoGame() {
  const G = loadCore();
  const s = G.core.createState({ seed: 42, demo: true });
  return { G, s };
}

test('FR-28: demo tools only work in demo mode', () => {
  const G = loadCore();
  const s = G.core.createState({ seed: 42 });
  assert.equal(G.core.act(s, { type: 'demo', action: 'money', amount: 1000 }).ok, false);
  assert.equal(s.money, 0);
});

test('FR-28: skipping time runs offline progress and reports it', () => {
  const { G, s } = demoGame();
  G.core.act(s, { type: 'demo', action: 'stage', stage: 3 });
  const money = s.money;
  const { out } = G.core.act(s, { type: 'demo', action: 'skip', seconds: 3600 });
  const note = out.find((n) => n.type === 'offline');
  assert.equal(note.summary.seconds, 3600);
  assert.ok(s.money > money);
});

test('FR-28: each caffeine mode starts on demand once it is unlocked', () => {
  const { G, s } = demoGame();
  assert.equal(G.core.act(s, { type: 'demo', action: 'fever', kind: 'prompt' }).ok, false, 'prompt mode needs stage 3');
  G.core.act(s, { type: 'demo', action: 'stage', stage: 4 });
  const r = G.core.act(s, { type: 'demo', action: 'fever', kind: 'review' });
  assert.ok(r.out.some((n) => n.type === 'feverStart' && n.kind === 'review'));
  assert.equal(G.core.act(s, { type: 'demo', action: 'fever', kind: 'prompt' }).ok, false, 'one caffeine mode at a time');
});
