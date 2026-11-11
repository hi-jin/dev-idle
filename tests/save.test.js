'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, plain, finishFirstApp } = require('./helpers');

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}

test('FR-26: a saved game loads back to the same state', () => {
  const { G, s } = fresh();
  finishFirstApp(G, s);
  for (let i = 0; i < 100; i++) G.core.tick(s, 0.1);
  const storage = memoryStorage();
  assert.equal(G.save.store(storage, s, 123), true);
  const loaded = G.save.load(storage, false);
  assert.equal(loaded.savedAt, 123);
  assert.deepEqual(plain(loaded.state), plain(s));
});

test('FR-26: fields missing from an older save are filled with defaults', () => {
  const { G, s } = fresh();
  const old = plain(s);
  delete old.dev;
  delete old.stats.released;
  const loaded = G.save.parse(JSON.stringify({ version: 1, savedAt: 1, state: old }));
  assert.deepEqual(plain(loaded.state.dev), { typing: 0, prompt: 0, review: 0 });
  assert.equal(loaded.state.stats.released, 0);
});

test('FR-26: a broken save is kept aside and the game starts fresh', () => {
  const { G } = fresh();
  const storage = memoryStorage();
  storage.setItem('devidle.save', '{not json');
  assert.equal(G.save.load(storage, false), null);
  assert.equal(storage.getItem('devidle.save.broken'), '{not json');
});

test('FR-28: demo saves use their own key', () => {
  const { G } = fresh();
  const storage = memoryStorage();
  const demo = G.core.createState({ seed: 1, demo: true });
  G.save.store(storage, demo, 1);
  assert.deepEqual(storage.keys(), ['devidle.demo']);
  assert.equal(G.save.load(storage, false), null);
});
