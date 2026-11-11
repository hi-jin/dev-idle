// Saving to localStorage with versions (FR-26). Storage is passed in so tests can use a fake.
(function (G) {
  'use strict';
  const save = (G.save = {});

  save.KEY = 'devidle.save';
  save.DEMO_KEY = 'devidle.demo';

  // migrations[v](state) upgrades a version-v state in place and sets
  // state.version = v + 1. Saves from before version 6 (the simplified game of
  // 2026-11-11) are too different to convert; they are set aside and a new game starts.
  save.OLDEST = 6;
  save.migrations = {};

  save.key = function (demo) {
    return demo ? save.DEMO_KEY : save.KEY;
  };

  function isPlainObject(x) {
    return Object.prototype.toString.call(x) === '[object Object]';
  }

  // Adds fields that newer code expects but an older save lacks.
  function fill(target, defaults) {
    for (const k of Object.keys(defaults)) {
      if (!(k in target)) target[k] = defaults[k];
      else if (isPlainObject(defaults[k]) && isPlainObject(target[k])) fill(target[k], defaults[k]);
    }
    return target;
  }

  save.serialize = function (state, now) {
    return JSON.stringify({ version: state.version, savedAt: now, state });
  };

  save.parse = function (text) {
    const data = JSON.parse(text);
    const state = data.state;
    let v = state.version || 1;
    if (v < save.OLDEST) throw new Error('Save from version ' + v + ' is too old');
    while (v < G.core.STATE_VERSION) {
      const migrate = save.migrations[v];
      if (!migrate) throw new Error('No migration from version ' + v);
      migrate(state);
      v = state.version;
    }
    fill(state, G.core.defaults());
    return { state, savedAt: data.savedAt || 0 };
  };

  // A save that fails to parse is kept under "<key>.broken" instead of being lost.
  save.load = function (storage, demo) {
    const key = save.key(demo);
    let text = null;
    try {
      text = storage.getItem(key);
      return text ? save.parse(text) : null;
    } catch (e) {
      try {
        if (text) storage.setItem(key + '.broken', text);
      } catch (ignored) {
        // storage full or unavailable
      }
      return null;
    }
  };

  save.store = function (storage, state, now) {
    try {
      storage.setItem(save.key(state.demo), save.serialize(state, now));
      return true;
    } catch (e) {
      return false;
    }
  };

  save.clear = function (storage, demo) {
    try {
      storage.removeItem(save.key(demo));
    } catch (e) {
      // nothing to clear
    }
  };
})(window.Game = window.Game || {});
