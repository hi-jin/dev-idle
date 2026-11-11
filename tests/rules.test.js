'use strict';

// The simplified game of 2026-11-11: apps in a fixed order, typing heat,
// the bug gauge and outages, context and focus, bugs to squash, grades.
const test = require('node:test');
const assert = require('node:assert/strict');
const { fresh, typeKeys, finishFirstApp } = require('./helpers');

// Finishes and releases whatever is being built until the stage is reached.
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
  assert.equal(G.core.act(s, { type: 'buyAgent', kind }).ok, true);
  return s.agents[s.agents.length - 1];
}

test('the first app takes about 120 keys, and one key writes 0.5 lines', () => {
  const { G, s } = fresh();
  assert.equal(G.core.linesPerKey(s), 0.5);
  const lines = s.apps[0].tasks.reduce((n, t) => n + t.lines, 0);
  assert.equal(lines / G.core.linesPerKey(s), 120);
});

test('releasing an app pays launch-day sales, raises the stage and starts the next app', () => {
  const { G, s } = fresh();
  const app = finishFirstApp(G, s);
  assert.equal(app.status, 'live');
  assert.equal(s.stage, 2);
  assert.ok(Math.abs(s.money - 200 * 0.25 * 1.5) < 1, 'the bonus is 1.5 minutes of base revenue');
  assert.equal(s.money > 30, true, 'enough for the first agent');
  assert.deepEqual(Array.from(s.apps, (a) => a.template + ':' + a.status), ['todo:live', 'photo:building']);
});

test('each stage is reached by releasing the next app in the order', () => {
  const { G, s } = fresh();
  for (const [stage, template] of [[2, 'todo'], [3, 'photo'], [4, 'shop'], [5, 'team']]) {
    assert.equal(G.core.stageProgress(s).template, template);
    reach(G, s, stage);
    assert.equal(s.stage, stage);
  }
  assert.equal(G.core.stageProgress(s), null);
  assert.equal(s.apps.find((a) => a.status === 'building').template, 'ai');
});

test('when every app is out, there is always an update to work on', () => {
  const { G, s } = fresh();
  reach(G, s, 5);
  const ai = s.apps.find((a) => a.template === 'ai');
  for (const t of ai.tasks.slice()) G.core.finishTask(s, ai, t, null, []);
  G.core.act(s, { type: 'release', appId: ai.id });
  const open = s.apps.flatMap((a) => a.tasks.filter((t) => !t.done));
  assert.equal(open.length >= 1, true);
  assert.equal(open.every((t) => t.kind === 'update'), true);
  const quality = ai.quality;
  const update = ai.tasks.find((t) => t.kind === 'update');
  if (update) {
    G.core.finishTask(s, ai, update, null, []);
    assert.equal(ai.quality > quality, true);
  }
});

test('typing heats up to 100 and makes agents up to twice as fast, then fades', () => {
  const { G, s } = fresh();
  finishFirstApp(G, s);
  const agent = hire(G, s, 'auto');
  G.core.tick(s, 1);
  s.typing.heat = 0;
  const base = G.core.agentSpeed(s, agent);
  for (let i = 0; i < 10; i++) G.core.act(s, { type: 'key', code: 'KeyA' });
  assert.equal(s.typing.heat, 40);
  assert.ok(Math.abs(G.core.agentSpeed(s, agent) / base - 1.4) < 1e-9);
  s.typing.heat = 100;
  assert.ok(Math.abs(G.core.agentSpeed(s, agent) / base - 2) < 1e-9);
  G.core.tick(s, 5);
  assert.equal(s.typing.heat, 40, '12 a second fade away');
  G.core.tick(s, 5);
  assert.equal(s.typing.heat, 0);
});

test('prompt skill makes every agent 25% faster per level', () => {
  const { G, s } = fresh();
  finishFirstApp(G, s);
  s.typing.heat = 0;
  const agent = hire(G, s, 'auto');
  const base = G.core.agentSpeed(s, agent);
  s.dev.prompt = 2;
  assert.ok(Math.abs(G.core.agentSpeed(s, agent) / base - 1.5625) < 1e-9);
});

test('a failed agent task goes back to 75% and stays assigned', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  const agent = hire(G, s, 'auto');
  const app = s.apps.find((a) => a.status === 'building');
  const hard = app.tasks.find((t) => t.difficulty === 3);
  s.rng = 1;
  let failed = false;
  for (let i = 0; i < 50 && !failed; i++) {
    hard.progress = hard.lines;
    const out = [];
    G.core.finishTask(s, app, hard, agent, out);
    failed = out.some((n) => n.type === 'taskFailed');
    if (!failed) {
      hard.done = false;
      hard.progress = 0;
    }
  }
  assert.equal(failed, true);
  assert.equal(hard.progress, hard.lines * 0.75);
  assert.equal(hard.done, false);
  assert.equal(s.bugs, 0, 'no bugs with Accept All off');
});

test('Accept All opens at stage 3, speeds agents up 1.3 times and turns failures into bugs', () => {
  const { G, s } = fresh();
  finishFirstApp(G, s);
  assert.equal(G.core.act(s, { type: 'acceptAll', on: true }).ok, false);
  reach(G, s, 3);
  s.typing.heat = 0;
  const agent = hire(G, s, 'auto');
  const base = G.core.agentSpeed(s, agent);
  assert.equal(G.core.act(s, { type: 'acceptAll', on: true }).ok, true);
  assert.ok(Math.abs(G.core.agentSpeed(s, agent) / base - 1.3) < 1e-9);

  const app = s.apps.find((a) => a.status === 'building');
  const hard = app.tasks.find((t) => t.difficulty === 3);
  let shipped = 0;
  while (s.bugs === 0 && shipped < 50) {
    hard.done = false;
    hard.progress = hard.lines;
    G.core.finishTask(s, app, hard, agent, []);
    shipped += 1;
  }
  assert.equal(hard.done, true, 'the failure ships anyway');
  assert.equal(hard.parts, 5, 'a shop feature comes in five parts');
  assert.ok(Math.abs(s.bugs - G.balance.tasks[3].bugs / Math.pow(5, 0.6)) < 1e-9, 'a part is a smaller failure');
  assert.equal(s.stats.tasksFailed, 0);
});

test('code review cuts the bugs a failure adds by 15% a level', () => {
  const { G, s } = fresh();
  assert.ok(Math.abs(G.core.bugGain(s, 2) - 0.14) < 1e-9);
  s.dev.review = 2;
  assert.ok(Math.abs(G.core.bugGain(s, 2) - 0.14 * 0.7) < 1e-9);
});

test('a full bug gauge starts an outage: no revenue and no agent work', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  const agent = hire(G, s, 'bulk');
  G.core.tick(s, 1);
  assert.equal(G.core.companyRevenue(s) > 0, true);
  const out = [];
  G.core.addBugs(s, 1, out);
  assert.equal(out.some((n) => n.type === 'outage'), true);
  assert.equal(G.core.inOutage(s), true);
  const task = G.core.findTask(s, agent.taskIds[0]).task;
  const before = { progress: task.progress, money: s.money };
  G.core.tick(s, 5);
  assert.equal(task.progress, before.progress);
  assert.equal(s.money, before.money);
  assert.equal(G.core.companyRevenue(s), 0);
  assert.equal(G.core.valuation(s) > 0, true, 'the valuation does not drop to zero');
});

test('typing 30 keys puts the first fire out; each later fire takes 10 more', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  G.core.addBugs(s, 1, []);
  assert.equal(s.outage.goal, 30);
  typeKeys(G, s, 29);
  assert.equal(G.core.inOutage(s), true);
  const out = G.core.act(s, { type: 'key', code: 'KeyA' }).out;
  assert.equal(out.some((n) => n.type === 'outageEnd' && n.byPlayer), true);
  assert.equal(G.core.inOutage(s), false);
  assert.equal(s.bugs, 0);
  assert.equal(s.stats.firesOut, 1);
  G.core.addBugs(s, 1, []);
  assert.equal(s.outage.goal, 40);
});

test('a fire nobody fights burns out after 30 seconds', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  G.core.addBugs(s, 1, []);
  let ended = null;
  for (let i = 0; i < 31 && !ended; i++) ended = G.core.tick(s, 1).find((n) => n.type === 'outageEnd') || null;
  assert.equal(ended.byPlayer, false);
  assert.equal(s.bugs, 0);
  assert.equal(s.stats.firesOut, 0);
});

test('with Accept All off the bug gauge drains slowly', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  s.bugs = 0.5;
  G.core.tick(s, 10);
  assert.ok(Math.abs(s.bugs - 0.45) < 1e-9);
  G.core.act(s, { type: 'acceptAll', on: true });
  G.core.tick(s, 10);
  assert.ok(Math.abs(s.bugs - 0.45) < 1e-9);
});

test('a full context halves the agent speed instead of stopping it', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  s.typing.heat = 0;
  const agent = hire(G, s, 'bulk');
  const base = G.core.agentSpeed(s, agent);
  agent.context = G.balance.agents.bulk.context;
  const notes = G.core.tick(s, 0.1);
  assert.equal(notes.some((n) => n.type === 'contextFull'), true);
  assert.equal(agent.full, true);
  assert.equal(agent.taskIds.length > 0, true, 'it keeps its tasks');
  assert.ok(Math.abs(G.core.agentSpeed(s, agent) / base - 0.5) < 1e-9);
});

test('compacting by hand empties the context and starts a focus boost by quality', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  s.typing.heat = 0;
  const agent = hire(G, s, 'bulk');
  const base = G.core.agentSpeed(s, agent);
  assert.equal(G.core.act(s, { type: 'compress', agentId: agent.id, scores: [1, 1, 1] }).ok, false, 'needs 50% context');
  agent.context = 800;
  agent.full = true;
  assert.equal(G.core.act(s, { type: 'compress', agentId: agent.id, scores: [1, 1, 2] }).ok, false);
  assert.equal(G.core.act(s, { type: 'compress', agentId: agent.id, scores: [1, 1, 1] }).ok, true);
  assert.equal(agent.context, 0);
  assert.equal(agent.full, false);
  assert.ok(Math.abs(G.core.agentSpeed(s, agent) / base - 2.5) < 1e-9, 'three perfects: 2.5 times');
  assert.equal(s.stats.perfectCompacts, 1);
  G.core.tick(s, 41);
  s.typing.heat = 0;
  assert.equal(G.core.focusActive(s, agent), false, 'focus lasts 40 seconds');

  agent.context = 800;
  G.core.act(s, { type: 'compress', agentId: agent.id, scores: [0.3, 0.3, 0.3] });
  assert.ok(Math.abs(agent.focus - (1.3 + 1.2 * 0.3)) < 1e-9, 'three misses still help a little');
});

test('auto-compacting empties a full context with no focus boost', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  const agent = hire(G, s, 'bulk');
  s.upgrades.autoCompress = 0;
  agent.context = 800;
  const notes = G.core.tick(s, 0.1);
  assert.equal(notes.some((n) => n.type === 'compressed' && n.auto), true);
  assert.equal(agent.context < 10, true);
  assert.equal(G.core.focusActive(s, agent), false);
});

test('a hallucinated bug pays cash when squashed and joins the gauge when missed', () => {
  const { G, s } = fresh();
  reach(G, s, 3);
  hire(G, s, 'auto');
  assert.equal(G.core.startEvent(s, 'hallucination', []), true);
  const ev = s.events.current;
  assert.equal(ev.cash >= 10, true);
  const money = s.money;
  const out = G.core.act(s, { type: 'event', choice: 'squash' }).out;
  assert.equal(out.some((n) => n.type === 'eventEnd' && n.squashed), true);
  assert.ok(Math.abs(s.money - money - ev.cash) < 1e-6);
  assert.equal(s.stats.bugsSquashed, 1);

  s.events.readyAt = 0;
  s.bugs = 0;
  G.core.startEvent(s, 'hallucination', []);
  const end = s.events.current.until;
  let missed = null;
  while (s.clock.runSeconds <= end + 1 && !missed) missed = G.core.tick(s, 0.5).find((n) => n.type === 'eventEnd') || null;
  assert.equal(missed.squashed, false);
  assert.equal(s.bugs > 0.09, true);
});

test('events wait 15 seconds after a stage-up, and none start during an outage', () => {
  const { G, s } = fresh();
  finishFirstApp(G, s);
  assert.equal(s.events.readyAt >= s.clock.runSeconds + 15 - 1e-9, true);
  reach(G, s, 3);
  G.core.addBugs(s, 1, []);
  for (const kind of G.core.EVENT_KINDS) assert.equal(G.core.eventPossible(s, kind), false, kind);
});

test('a viral post triples the user target for 45 seconds', () => {
  const { G, s } = fresh();
  const app = finishFirstApp(G, s);
  const target = G.core.userTarget(s, app);
  s.events.readyAt = 0;
  assert.equal(G.core.startEvent(s, 'viral', []), true);
  assert.ok(Math.abs(G.core.userTarget(s, app) / target - 3) < 1e-9);
  assert.equal(s.events.current.until - s.events.current.at, 45);
});

test('review mode takes 12% off the bug gauge for each bug caught', () => {
  const { G, s } = fresh();
  reach(G, s, 4);
  G.core.startFever(s, [], 'review');
  G.core.tick(s, 1.1);
  s.bugs = 0.5;
  let caught = false;
  for (let i = 0; i < 40 && !caught; i++) {
    const card = G.core.reviewCard(s);
    const out = G.core.act(s, { type: 'review', choice: card.bug === null ? 'ok' : card.bug }).out;
    caught = out.some((n) => n.type === 'reviewed' && n.fixed);
  }
  assert.equal(caught, true);
  assert.ok(Math.abs(s.bugs - 0.38) < 1e-9);
});

test('selling needs stage 3 and a $1M valuation, and the grade follows the valuation', () => {
  const { G, s } = fresh();
  finishFirstApp(G, s);
  assert.equal(G.core.canExit(s), 'stage');
  reach(G, s, 3);
  assert.equal(G.core.canExit(s), 'value');
  assert.equal(G.core.act(s, { type: 'exit' }).ok, false);
  assert.deepEqual([0, 1.4e7, 1.5e7, 2.9e8, 3e8, 4.9e9, 5e9].map((v) => G.core.exitGrade(v)), ['C', 'C', 'B', 'B', 'A', 'A', 'S']);
  assert.equal(G.core.nextGrade(1e6).id, 'B');
  assert.equal(G.core.nextGrade(6e9), null);
});

test('a sale reports grade, price and time, keeps points and achievements, and starts over', () => {
  const { G, s } = fresh();
  reach(G, s, 4);
  for (let i = 0; i < 60; i++) G.core.tick(s, 1);
  const value = G.core.valuation(s);
  assert.equal(value >= 1e6, true);
  const seconds = s.clock.runSeconds;
  const out = G.core.act(s, { type: 'exit' }).out;
  const note = out.find((n) => n.type === 'exit');
  assert.equal(note.grade, G.core.exitGrade(value));
  assert.ok(Math.abs(note.value - value) < 1e-6);
  assert.equal(note.seconds, seconds);
  assert.equal(note.apps, 3);
  assert.equal(s.stage, 1);
  assert.equal(s.clock.runSeconds, 0);
  assert.equal(s.prestige.exits, 1);
  assert.equal(s.prestige.points, note.points);
  assert.equal(s.money, note.points * 100);
  assert.equal(s.prestige.bestValuation >= value - 1e-6, true);
  assert.deepEqual(Array.from(s.apps, (a) => a.template), ['todo']);
  assert.equal(s.social.achievements.firstRelease, true);
});

test('prices: typing 20 x 2.5^level, agents 1.5 times more for each one owned', () => {
  const { G, s } = fresh();
  assert.equal(G.core.upgradePrice(s, 'typing'), 20);
  s.dev.typing = 2;
  assert.equal(G.core.upgradePrice(s, 'typing'), 125);
  assert.ok(Math.abs(G.core.linesPerKey(s) - 0.5 * 1.35 * 1.35) < 1e-9);
  finishFirstApp(G, s);
  hire(G, s, 'auto');
  assert.equal(G.core.agentPrice(s, 'auto'), 45);
});

test('every achievement has a condition, and none starts unlocked', () => {
  const { G, s } = fresh();
  assert.doesNotThrow(() => G.core.checkAchievements(s, []));
  assert.deepEqual(Object.keys(s.social.achievements), []);
  s.stats.firesOut = 3;
  s.stats.bugsSquashed = 10;
  s.stats.outages = 5;
  const out = [];
  G.core.checkAchievements(s, out);
  assert.deepEqual(out.map((n) => n.id).sort(), ['bugHunter', 'firefighter', 'justAcceptedAll']);
});

test('demo tools: jumping to a stage releases the apps, and an outage starts on demand', () => {
  const { G } = fresh();
  const s = G.core.createState({ seed: 1, demo: true });
  assert.equal(G.core.act(s, { type: 'demo', action: 'outage' }).ok, false, 'nothing is live yet');
  assert.equal(G.core.act(s, { type: 'demo', action: 'stage', stage: 4 }).ok, true);
  assert.equal(s.stage, 4);
  assert.equal(s.apps.filter((a) => a.status === 'live').length, 3);
  assert.equal(G.core.act(s, { type: 'demo', action: 'outage' }).ok, true);
  assert.equal(G.core.inOutage(s), true);
});

test('the same seed and the same actions give exactly the same game', () => {
  const run = () => {
    const { G, s } = fresh();
    finishFirstApp(G, s);
    hire(G, s, 'auto');
    for (let i = 0; i < 600; i++) {
      G.core.tick(s, 0.1);
      if (i % 3 === 0) G.core.act(s, { type: 'key', code: 'KeyA' });
      const app = s.apps.find((a) => G.core.isReleaseReady(a));
      if (app) G.core.act(s, { type: 'release', appId: app.id });
    }
    return JSON.stringify(s);
  };
  assert.equal(run(), run());
});

test('a save from before version 6 is set aside and a new game starts', () => {
  const { G } = fresh();
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  const old = JSON.stringify({ version: 5, savedAt: 1, state: { version: 5, money: 99 } });
  store.set(G.save.KEY, old);
  assert.equal(G.save.load(storage, false), null);
  assert.equal(store.get(G.save.KEY + '.broken'), old);
});

test('the tutorial only moves forward, can be skipped, and survives a sale', () => {
  const { G, s } = fresh();
  assert.deepEqual(JSON.parse(JSON.stringify(s.tutorial)), { step: 0, done: false });
  G.core.act(s, { type: 'tutorial', step: 3 });
  G.core.act(s, { type: 'tutorial', step: 1 });
  assert.equal(s.tutorial.step, 3);
  reach(G, s, 4);
  for (let i = 0; i < 60; i++) G.core.tick(s, 1);
  G.core.act(s, { type: 'exit' });
  assert.equal(s.tutorial.step, 3, 'a new company does not start it again');
  G.core.act(s, { type: 'tutorial', skip: true });
  assert.equal(s.tutorial.done, true);
});
