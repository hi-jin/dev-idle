'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CORE_FILES, ROOT } = require('../tools/load-core');

const TEXT_FILES = ['src/strings.en.js', 'src/strings.ko.js', 'src/strings-reviews.ko.js', 'src/i18n.js', 'src/ui/format.js', 'src/ui/names.js'];

// The core, the strings and the name helpers in one context, like the page loads them.
function load() {
  const ctx = { console, URLSearchParams };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of CORE_FILES.concat(TEXT_FILES)) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  return ctx.Game;
}

function sameShape(en, ko, where) {
  for (const key of Object.keys(en)) {
    const at = where + '.' + key;
    assert.ok(key in ko, 'missing in Korean: ' + at);
    const a = en[key];
    const b = ko[key];
    assert.equal(typeof b, typeof a, 'type differs: ' + at);
    if (Array.isArray(a)) assert.equal(b.length, a.length, 'length differs: ' + at);
    if (typeof a === 'function') assert.equal(typeof b('3', '4', '5'), 'string', 'not a string: ' + at);
    else if (a && typeof a === 'object') sameShape(a, b, at);
  }
}

test('FR-33: Korean has every English key, with the same kind of value', () => {
  const G = load();
  sameShape(G.stringSets.en, G.stringSets.ko, 'strings');
});

test('FR-33: every app, feature, agent, achievement and review card has a Korean name', () => {
  const G = load();
  const C = G.content;
  const ko = G.stringSets.ko;
  for (const t of Object.keys(C.apps)) {
    assert.ok(ko.appNames[t], 'app ' + t);
    for (const f of C.apps[t].release.concat(C.apps[t].updates)) assert.ok(ko.featureNames[f.name], 'feature ' + f.name);
  }
  for (const kind of Object.keys(C.agents)) for (const k of ['name', 'style', 'blurb']) assert.ok(ko.agentInfo[kind][k], `agent ${kind}.${k}`);
  for (const a of C.achievements) assert.ok(ko.achievementNames[a.id], 'achievement ' + a.id);
  assert.equal(JSON.stringify(Object.keys(ko.reviews).sort()), JSON.stringify(C.reviews.map((c) => c.id).sort()));
  for (const c of C.reviews) {
    assert.ok(ko.reviews[c.id].title && ko.reviews[c.id].why, c.id);
    assert.equal(ko.reviews[c.id].why.startsWith('문제없어요'), c.bug === null, c.id + ' clean or not');
  }
});

// A name can end in a vowel or not, so a particle straight after it (사진 공유을) is often wrong.
test('FR-33: no Korean particle comes right after a substituted name', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/strings.ko.js'), 'utf8');
  const bad = src.split('\n').filter((line) => /\}(을|를|이|가|은|는|과|와|으로|로)(?![가-힣])/.test(line));
  assert.deepEqual(bad, []);
});

test('FR-33: switching the language rewrites the shared strings in place', () => {
  const G = load();
  const S = G.strings;
  assert.equal(G.i18n.lang, 'en');
  assert.equal(S.tabAgents, 'Agents');
  assert.equal(G.i18n.set('ko'), true);
  assert.equal(G.strings, S, 'the same object, so modules see the change');
  assert.equal(S.tabAgents, '에이전트');
  assert.equal(S.stageLine(3, S.stageTitles[3]), '3단계 · 1인 창업자');
  assert.equal(G.i18n.set('fr'), false);
  G.i18n.set('en');
  assert.equal(S.tabAgents, 'Agents');
  assert.equal(S.featureNames, undefined, 'no Korean left behind');
});

test('FR-33: names kept in English in the state are shown in the chosen language', () => {
  const G = load();
  const ui = G.ui;
  assert.equal(ui.localAppName('Photo Share 2'), 'Photo Share 2');
  assert.equal(ui.taskName('Fix dark mode'), 'Fix dark mode');
  G.i18n.set('ko');
  assert.equal(ui.localAppName('Photo Share'), '사진 공유');
  assert.equal(ui.localAppName('Photo Share 2'), '사진 공유 2');
  assert.equal(ui.localAppName('Something else'), 'Something else');
  assert.equal(ui.taskName('Dark mode'), '다크 모드');
  assert.equal(ui.taskName('Dark mode v2'), '다크 모드 v2');
  assert.equal(ui.taskName('Fix dark mode'), '다크 모드 수정');
  assert.equal(ui.taskName('Fix a crash'), '충돌 수정');
  assert.equal(ui.agentInfo('precise').name, '정밀형 에이전트');
  assert.equal(ui.achievementName('firstExit'), '첫 엑싯');
  const card = G.content.reviews[0];
  assert.notEqual(ui.reviewText(card).title, card.title);
});
