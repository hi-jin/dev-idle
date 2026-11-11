'use strict';

const { loadCore } = require('../tools/load-core');

// Objects from the vm context have their own prototypes, so compare through JSON.
function plain(x) {
  return JSON.parse(JSON.stringify(x));
}

function fresh(options) {
  const G = loadCore(options);
  const s = G.core.createState({ seed: 42 });
  return { G, s };
}

// Types like a careful player: in caffeine mode it presses the key that is asked for.
function typeKeys(G, s, n) {
  for (let i = 0; i < n; i++) {
    // Step the clock past the per-second key limit.
    if (i % 10 === 0) G.core.tick(s, 1);
    let key = { code: 'KeyA', shift: false };
    if (G.core.feverActive(s)) key = G.core.keyForChar(G.core.expectedChar(s)) || key;
    G.core.act(s, { type: 'key', code: key.code, shift: key.shift });
  }
}

function finishFirstApp(G, s) {
  const app = s.apps[0];
  while (!G.core.isReleaseReady(app)) typeKeys(G, s, 10);
  G.core.act(s, { type: 'release', appId: app.id });
  return app;
}

module.exports = { loadCore, plain, fresh, typeKeys, finishFirstApp };
