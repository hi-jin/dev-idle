'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadCore } = require('./helpers');

// A stage-4 company with two live apps that earn, through the demo tools.
function stage4() {
  const G = loadCore();
  const s = G.core.createState({ seed: 42, demo: true });
  G.core.demoAction(s, { action: 'stage', stage: 4 }, []);
  G.core.act(s, { type: 'newApp', template: 'photo' });
  const photo = s.apps[s.apps.length - 1];
  for (const task of photo.tasks.slice()) G.core.finishTask(s, photo, task, null, []);
  G.core.releaseApp(s, photo.id, []);
  photo.users = G.core.userTarget(s, photo);
  for (let i = 0; i < 50; i++) G.core.tick(s, 0.1);
  if (G.core.feverActive(s)) G.core.endFever(s, []);
  return { G, s };
}

function inReview() {
  const { G, s } = stage4();
  G.core.startFever(s, [], 'review');
  G.core.tick(s, 1);
  return { G, s };
}

function showCard(G, s, withBug) {
  const f = s.caffeine.fever;
  f.cardIndex = G.content.reviews.findIndex((c) => (c.bug !== null) === withBug);
  f.cardAt = s.clock.totalSeconds;
  return G.core.reviewCard(s);
}

test('FR-06: answers in the first second do not count', () => {
  const { G, s } = stage4();
  G.core.startFever(s, [], 'review');
  assert.equal(G.core.act(s, { type: 'review', choice: 'ok' }).ok, false);
  G.core.tick(s, 1);
  assert.equal(G.core.act(s, { type: 'review', choice: 'ok' }).ok, true);
});

test('FR-06: Looks good on a clean change pays 10 seconds of revenue', () => {
  const { G, s } = inReview();
  showCard(G, s, false);
  const money = s.money;
  const revenue = G.core.companyRevenue(s);
  G.core.act(s, { type: 'review', choice: 'ok' });
  assert.ok(Math.abs(s.money - money - (revenue / 60) * 10) < 1e-6);
  assert.equal(s.caffeine.fever.correct, 1);
});

test('FR-06: a wrong answer pays nothing and holds the next change for 3 seconds', () => {
  const { G, s } = inReview();
  const card = showCard(G, s, true);
  const money = s.money;
  G.core.act(s, { type: 'review', choice: 'ok' });
  assert.equal(s.money, money);
  assert.equal(s.caffeine.fever.wrong, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(G.core.reviewLast(s))).card.id, card.id);
  assert.ok(Math.abs(G.core.reviewWait(s) - 3) < 1e-9);
  assert.equal(G.core.act(s, { type: 'review', choice: 'ok' }).ok, false);
  G.core.tick(s, 3);
  assert.equal(G.core.reviewWait(s), 0);

  const clean = showCard(G, s, false);
  G.core.act(s, { type: 'review', choice: 0 });
  assert.equal(s.caffeine.fever.wrong, 2, 'a clean change has no buggy line to pick');
  assert.equal(G.core.reviewLast(s).card.id, clean.id);
});

test('FR-06: keys 1 to 8 pick a line, Enter says Looks good, and other keys do nothing', () => {
  const { G, s } = inReview();
  const card = showCard(G, s, true);
  assert.equal(G.core.act(s, { type: 'key', code: 'KeyA' }).ok, false);
  assert.equal(s.caffeine.fever.cards, 0);
  const { out } = G.core.act(s, { type: 'key', code: 'Digit' + (card.bug + 1) });
  assert.ok(out.some((n) => n.type === 'reviewed' && n.right));
  showCard(G, s, false);
  const r = G.core.act(s, { type: 'key', code: 'Enter' });
  assert.ok(r.out.some((n) => n.type === 'reviewed' && n.right));
  assert.equal(G.core.act(s, { type: 'tap' }).ok, false);
});

test('FR-06: review mode reports bugs and cash at the end', () => {
  const { G, s } = inReview();
  const card = showCard(G, s, true);
  G.core.act(s, { type: 'review', choice: card.bug });
  const out = G.core.tick(s, 20);
  const end = out.find((n) => n.type === 'feverEnd');
  assert.equal(end.kind, 'review');
  assert.equal(end.bugs, 1);
  assert.equal(end.cards, 1);
  assert.ok(end.cash > 0);
});

// Spec 7.2 and 7.3.
test('content: 40 typeable prompts of 30 to 80 characters', () => {
  const G = loadCore();
  const prompts = G.content.prompts;
  assert.equal(prompts.length, 40);
  assert.equal(new Set(prompts).size, 40);
  for (const p of prompts) {
    assert.ok(p.length >= 30 && p.length <= 80, p);
    assert.ok(/^[A-Za-z0-9 ,.'-]+$/.test(p), p);
    assert.ok(!/ {2}|^ | $/.test(p), p);
    for (const ch of p) assert.ok(G.core.keyForChar(ch), ch);
  }
});

test('content: 60 review changes of 8 lines, 60% with one buggy changed line', () => {
  const G = loadCore();
  const cards = G.content.reviews;
  assert.equal(cards.length, 60);
  assert.equal(new Set(cards.map((c) => c.id)).size, 60);
  assert.equal(cards.filter((c) => c.bug !== null).length, 36);
  for (const c of cards) {
    assert.equal(c.lines.length, 8, c.id);
    assert.ok(c.title && c.file && c.why, c.id);
    assert.ok(c.why.length <= 90, c.id);
    for (const line of c.lines) {
      assert.ok(/^[ +-]/.test(line), c.id + ': ' + line);
      assert.ok(line.length <= 50, c.id + ': ' + line);
      assert.ok(/^[\x20-\x7e]*$/.test(line), c.id + ': ' + line);
    }
    assert.ok(c.lines.filter((l) => l[0] !== ' ').length >= 2, c.id);
    if (c.bug !== null) assert.ok(c.lines[c.bug][0] !== ' ', c.id + ' bug is on a changed line');
    else assert.ok(c.why.startsWith('Fine:'), c.id);
  }
  assert.ok(/share/i.test(cards[0].title) && cards[0].bug !== null, 'r1 is the share-link change');
});
