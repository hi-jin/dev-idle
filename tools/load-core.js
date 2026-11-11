// Loads the browser game logic into a Node vm context, in the same order as
// index.html, and returns window.Game. Used by tests and simulate.js.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

const CORE_FILES = [
  'code-dump/snippets.js',
  'src/balance.js',
  'src/content.js',
  'src/content-fevers.js',
  'src/rng.js',
  'src/core/state.js',
  'src/core/tasks.js',
  'src/core/typing.js',
  'src/core/fevers.js',
  'src/core/agents.js',
  'src/core/market.js',
  'src/core/quality.js',
  'src/core/social.js',
  'src/core/shop.js',
  'src/core/progression.js',
  'src/core/forecast.js',
  'src/core/events.js',
  'src/core/offline.js',
  'src/core/demo.js',
  'src/core/tick.js',
  'src/save.js',
];

function loadCore(options) {
  const opts = options || {};
  const files = opts.withoutCodeDump ? CORE_FILES.filter((f) => !f.startsWith('code-dump/')) : CORE_FILES;
  const ctx = { console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  }
  return ctx.Game;
}

module.exports = { loadCore, CORE_FILES, ROOT };
