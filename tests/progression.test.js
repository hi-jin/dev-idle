'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, finishFirstApp } = require('./helpers');

test('FR-18: the first release reaches stage 2', () => {
  const { G, s } = fresh();
  assert.equal(s.stage, 1);
  const app = s.apps[0];
  for (const t of app.tasks) {
    t.progress = t.lines;
    t.done = true;
  }
  const { out } = G.core.act(s, { type: 'release', appId: app.id });
  assert.equal(s.stage, 2);
  assert.ok(out.some((n) => n.type === 'stage' && n.stage === 2));
});
