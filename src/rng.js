// Seeded RNG (mulberry32). The generator state lives in state.rng so saves and
// simulations replay exactly. Never use Math.random() in game logic.
(function (G) {
  'use strict';

  G.rng = {
    seedFrom(seed) {
      const n = Number(seed) >>> 0;
      return n === 0 ? 0x9e3779b9 : n;
    },

    next(state) {
      state.rng = (state.rng + 0x6d2b79f5) >>> 0;
      let t = state.rng;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    pick(state, list) {
      return list[Math.floor(G.rng.next(state) * list.length)];
    },

    // Picks one item with chance in proportion to weight(item).
    weighted(state, list, weight) {
      const total = list.reduce((sum, x) => sum + weight(x), 0);
      let r = G.rng.next(state) * total;
      for (const x of list) {
        r -= weight(x);
        if (r < 0) return x;
      }
      return list[list.length - 1];
    },
  };
})(window.Game = window.Game || {});
