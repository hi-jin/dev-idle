#!/usr/bin/env node
// Balance simulation for the simplified game (2026-11-11).
//
//   node tools/simulate.js --runs 20 --minutes 12 --kps 6 --bot careful
//   --bot acceptall   turns Accept All on as soon as it opens
//   --kps 4           keys a second (a relaxed player is about 4, a fast one 7)
//   --set acceptAll.speed=1.5   change a balance number for this run only
//
// The bot types all the time, releases an app the second it is ready, buys the
// best agent it can afford, buys an upgrade when it costs less than half its
// money, squashes every bug and puts fires out by typing. A person decides
// more slowly, so read the times as the fastest a careful player gets.
'use strict';

const { loadCore } = require('./load-core');

function args() {
  const a = { runs: 20, minutes: 12, kps: 6, seed: 1000, bot: 'careful' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '');
    if (key === 'set') (a.set = a.set || []).push(argv[i + 1]);
    else a[key] = key === 'bot' ? argv[i + 1] : Number(argv[i + 1]);
  }
  return a;
}

const A = args();
const G = loadCore();
const core = G.core;
const B = G.balance;
for (const pair of A.set || []) {
  const [key, value] = pair.split('=');
  const parts = key.split('.');
  let o = B;
  for (const p of parts.slice(0, -1)) o = o[p];
  o[parts[parts.length - 1]] = Number(value);
}

function run(seed) {
  const s = core.createState({ seed });
  const r = { stage: {}, released: {}, grade: {}, outages: 0, events: 0 };
  const note = (n) => {
    const t = s.clock.runSeconds;
    if (n.type === 'stage') r.stage[n.stage] = t;
    else if (n.type === 'released') r.released[core.findApp(s, n.appId).template] = t;
    else if (n.type === 'outage') r.outages += 1;
    else if (n.type === 'event') r.events += 1;
  };
  const act = (a) => core.act(s, a).out.forEach(note);
  for (let sec = 0; sec < A.minutes * 60; sec++) {
    for (let i = 0; i < 10; i++) core.tick(s, 0.1).forEach(note);
    for (let k = 0; k < A.kps; k++) {
      let key = { code: 'KeyA', shift: false };
      if (core.feverKind(s) === 'typing') key = core.keyForChar(core.expectedChar(s)) || key;
      act({ type: 'key', code: key.code, shift: key.shift });
    }
    for (const app of s.apps) if (core.isReleaseReady(app)) act({ type: 'release', appId: app.id });
    const ev = s.events.current;
    if (ev && ev.kind === 'hallucination') act({ type: 'event', choice: 'squash' });
    if (ev && ev.kind === 'investor') act({ type: 'event', choice: 'accept' });
    for (const kind of ['local', 'precise', 'longctx', 'bulk', 'auto']) while (!core.canBuyAgent(s, kind)) act({ type: 'buyAgent', kind });
    for (const key of Object.keys(B.shop)) if (!core.canBuyUpgrade(s, key) && core.upgradePrice(s, key) < s.money * 0.5) act({ type: 'buyUpgrade', key });
    if (A.bot === 'acceptall' && s.stage >= B.acceptAll.stage && !s.acceptAll.on) act({ type: 'acceptAll', on: true });
    const grade = core.exitGrade(core.valuation(s));
    if (!core.canExit(s) && r.grade[grade] == null) r.grade[grade] = s.clock.runSeconds;
  }
  r.failed = s.stats.tasksFailed;
  r.valuation = core.valuation(s);
  return r;
}

const runs = [];
for (let i = 0; i < A.runs; i++) runs.push(run(A.seed + i));

const clock = (t) => (t == null ? '  -  ' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`.padStart(5));
function mean(pick) {
  const xs = runs.map(pick).filter((x) => x != null);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}
const reached = (pick) => runs.filter((r) => pick(r) != null).length;

console.log(`bot ${A.bot} · ${A.kps} keys/s · ${A.runs} runs of ${A.minutes} min`);
console.log('\nstage reached (mean time, runs that got there)');
for (const st of [2, 3, 4, 5]) console.log(`  stage ${st}  ${clock(mean((r) => r.stage[st]))}  ${reached((r) => r.stage[st])}/${A.runs}`);
console.log(`  AI app   ${clock(mean((r) => r.released.ai))}  ${reached((r) => r.released.ai)}/${A.runs}`);
console.log('\na sale would first get this grade at');
for (const g of B.exit.grades) console.log(`  ${g.id}  ${clock(mean((r) => r.grade[g.id]))}  ${reached((r) => r.grade[g.id])}/${A.runs}`);
console.log(`\nper run: ${mean((r) => r.outages).toFixed(1)} outages, ${mean((r) => r.events).toFixed(1)} events, ${mean((r) => r.failed).toFixed(1)} failed tasks`);
console.log(`valuation at the end: $${(mean((r) => r.valuation) / 1e9).toFixed(1)}B`);
