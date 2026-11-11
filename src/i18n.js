// The screen language (FR-33). English is the default. The language button at
// the top switches to Korean, and so does ?lang=ko; the choice is remembered in
// this browser. Every module holds the same G.strings object, so switching
// rewrites it in place and the next render shows the new language.
(function (G) {
  'use strict';
  const KEY = 'devidle.lang';
  const sets = G.stringSets;

  function apply(lang) {
    for (const k of Object.keys(G.strings)) delete G.strings[k];
    // Korean fills every key; English stays underneath for anything added later.
    Object.assign(G.strings, sets.en, lang === 'en' ? null : sets[lang]);
    G.i18n.lang = lang;
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
  }

  G.i18n = {
    lang: 'en',
    languages: Object.keys(sets),
    set(lang) {
      if (!sets[lang]) return false;
      apply(lang);
      try {
        window.localStorage.setItem(KEY, lang);
      } catch (e) {
        // the choice lasts until the page closes
      }
      return true;
    },
    // The other language, for the one-button switch.
    other() {
      return G.i18n.lang === 'ko' ? 'en' : 'ko';
    },
  };

  let start = 'en';
  // false on the very first start: nobody has picked a language yet, so the
  // game asks (main.js). English shows behind the question.
  G.i18n.chosen = false;
  try {
    const asked = new URLSearchParams(window.location.search).get('lang');
    const saved = window.localStorage.getItem(KEY);
    start = sets[asked] ? asked : sets[saved] ? saved : 'en';
    G.i18n.chosen = !!(sets[asked] || sets[saved]);
  } catch (e) {
    // no storage or no address: English
  }
  apply(start);
})(window.Game = window.Game || {});
