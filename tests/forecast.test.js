'use strict';

// The run's log, forecasts and "what if" (2026-11-11), and the two rules that
// make a new hire matter at once: taking tasks over, and typing on the app
// being built first.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, plain } = require('./helpers');

function release(G, s) {
  const app = s.apps.find((a) => G.core.isReleaseReady(a));
  if (app) G.core.act(s, { type: 'release', appId: app.id });
}

// Plays like a person: types, releases what is ready.
function play(G, s, seconds, kps) {
  for (let t = 0; t < seconds; t++) {
    for (let i = 0; i < 10; i++) G.core.tick(s, 0.1);
    for (let k = 0; k < kps; k++) G.core.act(s, { type: 'key', code: 'KeyA' });
    release(G, s);
  }
}

function reach(G, s, stage) {
  while (s.stage < stage) {
    const app = s.apps.find((a) => a.status === 'building');
    for (const t of app.tasks.slice()) if (!t.done) G.core.finishTask(s, app, t, null, []);
    G.core.act(s, { type: 'release', appId: app.id });
    app.users = G.core.userTarget(s, app);
  }
}

function hire(G, s, kind) {
  s.money += G.core.agentPrice(s, kind);
  const r = G.core.act(s, { type: 'buyAgent', kind });
  assert.equal(r.ok, true);
  return s.agents[s.agents.length - 1];
}

test('the log samples the valuation every 2 seconds and marks releases and choices', () => {
  const { G, s } = fresh();
  play(G, s, 30, 6);
  assert.equal(s.stage, 2);
  assert.equal(s.log.samples.length, 15);
  assert.deepEqual(plain(s.log.samples[0]).slice(0, 2), [2, 0]);
  assert.equal(s.log.samples[14][1] > 0, true, 'valuation after the release');
  assert.equal(s.log.samples[5][2], 6, 'six keys a second');
  const r = G.core.act(s, { type: 'buyAgent', kind: 'auto' });
  assert.equal(r.mark.k, 'hire');
  assert.equal(r.mark.w, 'auto');
  s.money += 20;
  assert.equal(G.core.act(s, { type: 'buyUpgrade', key: 'typing' }).mark.k, 'upgrade');
  assert.equal(G.core.act(s, { type: 'buyUpgrade', key: 'typing' }).mark, null, 'a failed purchase leaves no mark');
  assert.deepEqual(Array.from(s.log.marks, (m) => m.k), ['release', 'hire', 'upgrade']);
});

test('a forecast changes nothing in the real game and gives the same answer twice', () => {
  const { G, s } = fresh();
  play(G, s, 30, 6);
  hire(G, s, 'auto');
  const before = JSON.stringify(s);
  const a = G.core.forecast(s, null, { seconds: 120, kps: 5 });
  const b = G.core.forecast(s, null, { seconds: 120, kps: 5 });
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(plain(a), plain(b));
  assert.equal(a.series.length, 121);
  assert.equal(a.releases[0].template, 'photo');
});

test('a forecast with one more agent releases sooner; a locked choice has no forecast', () => {
  const { G, s } = fresh();
  play(G, s, 30, 6);
  const opts = { seconds: 300, kps: 4 };
  const base = G.core.forecast(s, null, opts);
  const alt = G.core.forecast(s, { type: 'buyAgent', kind: 'auto' }, opts);
  const cmp = G.core.compareForecasts(base, alt, 120);
  assert.equal(cmp.sooner > 3, true);
  assert.equal(cmp.gain >= 0, true);
  assert.equal(cmp.outages, 0);
  assert.equal(G.core.forecast(s, { type: 'buyAgent', kind: 'precise' }, opts), null, 'opens at stage 3');
  assert.equal(s.agents.length, 0, 'the real game hired nobody');
});

test('a forecast with Accept All on counts the outages it expects', () => {
  const { G, s } = fresh();
  // autocomplete bots get the hard tasks of the team app wrong most of the time
  reach(G, s, 4);
  for (let i = 0; i < 6; i++) hire(G, s, 'auto');
  const opts = { seconds: 600, kps: 4 };
  const base = G.core.forecast(s, null, opts);
  const alt = G.core.forecast(s, { type: 'acceptAll', on: true }, opts);
  assert.equal(base.outages, 0);
  assert.equal(alt.outages >= 1, true);
  assert.equal(G.core.compareForecasts(base, alt, 120).outages, alt.outages);
});

test('what-if: playing on without a hire ends lower than with it', () => {
  const { G, s } = fresh();
  play(G, s, 30, 6);
  s.money += 30;
  const snapshot = JSON.stringify(s);
  const action = { type: 'buyAgent', kind: 'auto' };
  G.core.act(s, action);
  play(G, s, 60, 6);
  const w = G.core.whatIf(snapshot, action, [], s.clock.runSeconds, () => 6, 1);
  assert.equal(w.taken.end > w.skipped.end, true);
  assert.equal(w.ratio > 1, true);
  assert.equal(Math.round(w.skipped.series[0][0]), 30, 'starts at the moment of the choice');
  assert.equal(Math.round(w.skipped.series[w.skipped.series.length - 1][0]), 90);
});

test('what-if replays the choices that came later', () => {
  const { G, s } = fresh();
  play(G, s, 30, 6);
  s.money += 1000;
  const snapshot = JSON.stringify(s);
  const first = { type: 'buyAgent', kind: 'auto' };
  const later = [{ t: 40, action: { type: 'buyUpgrade', key: 'typing' } }];
  const withLater = G.core.whatIf(snapshot, first, later, 150, () => 6, 1);
  const without = G.core.whatIf(snapshot, first, [], 150, () => 6, 1);
  assert.equal(withLater.skipped.releases[0].t < without.skipped.releases[0].t, true, 'the typing upgrade still happens');
});

test('a free agent takes over a task it is at least 1.3 times faster at', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  const bulk = hire(G, s, 'bulk');
  const app = s.apps.find((a) => a.status === 'building');
  const auto = hire(G, s, 'auto');
  // bulk holds three tasks; the two bots share what is left
  const hard = app.tasks.find((t) => t.difficulty === 3);
  for (const t of app.tasks) if (t !== hard && !t.assignee && !t.done) G.core.finishTask(s, app, t, null, []);
  if (!hard.assignee) {
    hard.assignee = auto.id;
    auto.taskIds = [hard.id];
  }
  const holder = G.core.findAgent(s, hard.assignee);
  const precise = hire(G, s, 'precise');
  assert.equal(G.core.effectiveRate(s, 'precise', 3) / G.core.effectiveRate(s, holder.kind, 3) > 1.3, true);
  assert.equal(hard.assignee, precise.id, 'the new hire took the hard task');
  assert.equal(holder.taskIds.includes(hard.id), false);
  // and nobody takes it back
  G.core.tick(s, 1);
  assert.equal(hard.assignee, precise.id);
  assert.equal(bulk.taskIds.length > 0, true);
});

test('typing goes to the app being built before any update', () => {
  const { G, s } = fresh();
  reach(G, s, 2);
  const live = s.apps.find((a) => a.status === 'live');
  live.tasks.push(G.core.makeTask(s, live, G.core.nextUpdate(s, live), 'update'));
  const building = s.apps.find((a) => a.status === 'building');
  assert.equal(G.core.peekTypingTarget(s).app.id, building.id);
  for (const t of building.tasks) t.assignee = 'someone';
  assert.equal(G.core.peekTypingTarget(s).app.id, building.id, 'even when agents hold every task');
});

test('features of later apps come in parts: shop and team 5, AI 6, and several agents can share one', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  const shop = s.apps.find((a) => a.template === 'shop');
  assert.equal(shop.tasks.length, 5 * 5);
  const pay = shop.tasks.filter((t) => t.name === 'Checkout and payments');
  assert.deepEqual(Array.from(pay, (t) => [t.part, t.parts, t.lines]), [0, 1, 2, 3, 4].map((i) => [i, 5, 400]));
  // the whole feature is worth what one task of it used to be
  const quality = shop.quality;
  for (const t of pay) G.core.finishTask(s, shop, t, null, []);
  assert.ok(Math.abs(shop.quality - quality - G.balance.tasks[3].quality) < 1e-9);
  // an update is one task as long as all the parts together
  reach(G, s, 4);
  const live = s.apps.find((a) => a.template === 'shop');
  const update = G.core.makeTask(s, live, { name: 'Reviews', difficulty: 2, tag: 'general' }, 'update');
  assert.deepEqual([update.parts, update.lines], [1, 500]);
  reach(G, s, 5);
  assert.equal(s.apps.find((a) => a.template === 'ai').tasks.length, 7 * 6);
});

test('a sale hands the run log to the result and starts a new one', () => {
  const { G, s } = fresh();
  reach(G, s, 4);
  for (let i = 0; i < 60; i++) G.core.tick(s, 1);
  const samples = s.log.samples.length;
  const note = G.core.act(s, { type: 'exit' }).out.find((n) => n.type === 'exit');
  assert.equal(note.log.samples.length, samples);
  assert.equal(note.log.marks.some((m) => m.k === 'release'), true);
  assert.deepEqual(plain(s.log), { samples: [], marks: [], at: 0, eff: 0, id: 0 });
});

test('letting an agent go frees its desk, pays 30% back and hands its tasks on', () => {
  const { G, s } = fresh();
  reach(G, s, 2);
  const first = hire(G, s, 'auto');
  const second = hire(G, s, 'auto');
  assert.equal(G.core.canBuyAgent(s, 'auto'), 'slots');
  const task = G.core.findTask(s, first.taskIds[0]).task;
  const money = s.money;
  assert.ok(Math.abs(G.core.agentRefund(s, 'auto') - 45 * 0.3) < 1e-9, 'of what the second one cost');
  const r = G.core.act(s, { type: 'fireAgent', agentId: first.id, kind: 'auto' });
  assert.equal(r.ok, true);
  assert.equal(r.mark.k, 'dismiss');
  assert.ok(Math.abs(s.money - money - 13.5) < 1e-9);
  assert.deepEqual(Array.from(s.agents, (a) => a.id), [second.id]);
  assert.notEqual(task.assignee, first.id);
  assert.equal(G.core.canBuyAgent(s, 'auto') === 'slots', false, 'a desk is free again');
  // in a what-if replay the ids differ, so the kind finds the agent
  assert.equal(G.core.act(s, { type: 'fireAgent', agentId: 'gone', kind: 'auto' }).ok, true);
  assert.equal(G.core.act(s, { type: 'fireAgent', agentId: 'gone', kind: 'auto' }).ok, false);
});

test('holding events: none starts for a while, and a bug on the desk waits', () => {
  const { G, s } = fresh();
  reach(G, s, 2);
  hire(G, s, 'auto');
  s.events.readyAt = 0;
  G.core.startEvent(s, 'hallucination', []);
  const until = s.events.current.until;
  assert.equal(G.core.act(s, { type: 'hold', seconds: 12 }).ok, true);
  assert.equal(s.events.current.until, until + 12);
  assert.equal(s.events.readyAt >= s.clock.runSeconds + 12, true);
});

test('a comparison says how much of the wait a choice saves, for the release and for a goal', () => {
  const { G, s } = fresh();
  play(G, s, 30, 6);
  const opts = { seconds: 600, kps: 4 };
  const base = G.core.forecast(s, null, opts);
  const alt = G.core.forecast(s, { type: 'buyAgent', kind: 'auto' }, opts);
  const goal = 3e5;
  const cmp = G.core.compareForecasts(base, alt, 120, goal);
  const wait = base.releases[0].t - s.clock.runSeconds;
  assert.ok(Math.abs(cmp.saved - Math.max(cmp.sooner / wait, cmp.goalSooner / (G.core.reachTime(base, goal) - s.clock.runSeconds))) < 1e-9);
  assert.equal(cmp.saved > 0.05 && cmp.saved < 1, true);
  assert.equal(cmp.goalSooner > 0, true);
  assert.equal(cmp.rate > 0, true, 'the app gets written faster');
  // the same forecast against itself saves nothing
  const same = G.core.compareForecasts(base, base, 120, goal);
  assert.deepEqual([same.sooner, same.goalSooner, same.saved, same.gain, same.rate], [0, 0, 0, 0, 0]);
  // a goal nobody reaches
  assert.equal(G.core.compareForecasts(base, alt, 120, 1e12).goalSooner, null);
});

test('work shares: how much of the app being built the player types', () => {
  const { G, s } = fresh();
  let sh = G.core.workShares(s, 4);
  assert.deepEqual([sh.typing, sh.agents, sh.share, sh.building, sh.left], [2, 0, 1, true, 60]);
  reach(G, s, 2);
  hire(G, s, 'auto');
  s.typing.heat = 0;
  sh = G.core.workShares(s, 4);
  assert.equal(sh.agents > 0, true);
  assert.ok(Math.abs(sh.share - 2 / (2 + sh.agents)) < 1e-9);
});
