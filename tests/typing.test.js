'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, typeKeys } = require('./helpers');

test('FR-01: typed work finishes tasks in order and always succeeds', () => {
  const { G, s } = fresh();
  G.balance.typing.gaugeMax = Infinity; // no caffeine mode here
  const [first, second] = s.apps[0].tasks;
  typeKeys(G, s, 400);
  assert.equal(first.done, true);
  assert.equal(second.done, true);
  assert.equal(s.stats.tasksFailed, 0);
});

test('FR-02: keys over the per-second limit are ignored', () => {
  const { G, s } = fresh();
  let accepted = 0;
  for (let i = 0; i < 20; i++) if (G.core.act(s, { type: 'key', code: 'KeyA' }).ok) accepted++;
  assert.equal(accepted, G.balance.typing.maxKeysPerSecond);
  G.core.tick(s, 1);
  assert.equal(G.core.act(s, { type: 'key', code: 'KeyA' }).ok, true);
});

test('FR-02: modifier and function keys do not type', () => {
  const { G, s } = fresh();
  for (const code of ['ShiftLeft', 'MetaLeft', 'F5', 'Escape', 'Tab', 'ArrowUp', '']) {
    assert.equal(G.core.act(s, { type: 'key', code }).ok, false, code);
  }
  assert.equal(s.stats.keys, 0);
});

test('the cursor moves three visible characters per key and skips whitespace', () => {
  const { G, s } = fresh({ withoutCodeDump: true });
  // fallback text starts with "function hello(name) {"
  G.core.act(s, { type: 'key', code: 'KeyA' });
  assert.equal(s.typing.pos, 3);
  G.core.act(s, { type: 'key', code: 'KeyA' });
  G.core.act(s, { type: 'key', code: 'KeyA' });
  // "function" (8) + " " skipped + "h" = 9 visible chars over 3 keys
  assert.equal(G.content.fallbackSnippet.text.slice(0, s.typing.pos), 'function h');
});

test('FR-01: typing into an agent\'s task speeds it up but the agent still rolls', () => {
  const { G, s } = fresh();
  for (const t of s.apps[0].tasks) {
    t.progress = t.lines;
    t.done = true;
  }
  G.core.act(s, { type: 'release', appId: s.apps[0].id });
  G.core.act(s, { type: 'newApp', template: 'photo' });
  s.money = 100;
  G.core.act(s, { type: 'buyAgent', kind: 'auto' });
  const task = G.core.findTask(s, s.agents[0].taskIds[0]).task;
  for (const t of s.apps[1].tasks) if (t !== task) t.done = true;
  G.balance.agents.auto.accuracy = [0, 0, 0, 0];
  G.balance.probability.min = 0;
  G.balance.failure.visibleBase = 1;
  task.progress = task.lines - 0.1;
  G.core.act(s, { type: 'setTypingTask', taskId: task.id });
  const { out } = G.core.act(s, { type: 'key', code: 'KeyA' });
  assert.equal(task.done, false);
  assert.ok(out.some((n) => n.type === 'taskFailed'));
});

test('a finished snippet is followed by a new one', () => {
  const { G, s } = fresh({ withoutCodeDump: true });
  const len = G.content.fallbackSnippet.text.length;
  for (let i = 0; i < len; i++) {
    if (i % 10 === 0) G.core.tick(s, 1);
    G.core.act(s, { type: 'key', code: 'KeyA' });
  }
  assert.ok(s.typing.pos < len);
  assert.equal(s.typing.snippetId, 'fallback');
});

test('snippets follow the tag of the task being typed', () => {
  const { G, s } = fresh();
  const task = s.apps[0].tasks[0];
  G.core.act(s, { type: 'key', code: 'KeyA' });
  assert.equal(G.core.getSnippet(s.typing.snippetId).tag, task.tag);
});
