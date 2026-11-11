'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadCore, plain } = require('./helpers');
const { CORE_FILES, ROOT } = require('../tools/load-core');

function play(seed) {
  const G = loadCore();
  const s = G.core.createState({ seed });
  for (let step = 0; step < 30000; step++) {
    if (step % 2 === 0) G.core.act(s, { type: 'key', code: 'KeyJ' });
    G.core.tick(s, 0.1);
    for (const app of s.apps) if (G.core.isReleaseReady(app)) G.core.act(s, { type: 'release', appId: app.id });
    if (s.stage >= 2 && s.apps.length < 2) G.core.act(s, { type: 'newApp', template: 'photo' });
    for (const kind of ['bulk', 'auto']) G.core.act(s, { type: 'buyAgent', kind });
  }
  return s;
}

test('a different seed gives a different game', () => {
  assert.notDeepEqual(plain(play(7)).rng, plain(play(8)).rng);
});

test('index.html loads the core files in the same order as the Node loader', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  const coreInHtml = scripts.filter((src) => CORE_FILES.includes(src));
  assert.deepEqual(coreInHtml, CORE_FILES);
});
