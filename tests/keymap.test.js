'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

const G = loadCore();

test('FR-02: every printable ASCII character maps to a physical key', () => {
  for (let c = 0x20; c <= 0x7e; c++) {
    const ch = String.fromCharCode(c);
    const k = G.core.keyForChar(ch);
    assert.ok(k, `no key for ${JSON.stringify(ch)}`);
    assert.ok(G.core.isTypingKey(k.code), `${k.code} is not a typing key`);
    assert.equal(G.core.keyMatchesChar(ch, k.code, k.shift), true, ch);
  }
});

test('FR-02: matching uses the physical key, so a Korean IME keydown still matches', () => {
  // With the Korean IME on, pressing A gives key "ㅁ" but code "KeyA".
  assert.equal(G.core.keyMatchesChar('a', 'KeyA', false), true);
  assert.equal(G.core.keyMatchesChar('A', 'KeyA', false), true);
  assert.equal(G.core.keyMatchesChar('a', 'KeyS', false), false);
});

test('FR-02: symbols need the right Shift state; digits accept the numpad', () => {
  assert.equal(G.core.keyMatchesChar('{', 'BracketLeft', true), true);
  assert.equal(G.core.keyMatchesChar('{', 'BracketLeft', false), false);
  assert.equal(G.core.keyMatchesChar('[', 'BracketLeft', true), false);
  assert.equal(G.core.keyMatchesChar('7', 'Numpad7', false), true);
  assert.equal(G.core.keyMatchesChar('\n', 'NumpadEnter', false), true);
});

test('all generated snippets are plain ASCII', () => {
  for (const sn of G.codeDump.snippets) {
    assert.doesNotMatch(sn.text, /[^\x20-\x7e\n]/, sn.id);
  }
});
