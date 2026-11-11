// Names from the game content in the screen language. The state keeps English
// names (apps, tasks, feed entries), so they are translated when shown:
// "Photo Share 2" is "사진 공유 2" and "Fix dark mode" is "다크 모드 수정" in Korean.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const C = G.content;
  const S = G.strings;

  let features = null;
  function allFeatures() {
    if (!features) {
      features = [];
      for (const def of Object.values(C.apps)) for (const f of def.release.concat(def.updates)) features.push(f.name);
    }
    return features;
  }

  const featureName = (name) => (S.featureNames && S.featureNames[name]) || name;

  ui.templateName = function (template) {
    return (S.appNames && S.appNames[template]) || C.apps[template].name;
  };

  // An app name as stored: the template's English name, then a number for the second copy on.
  ui.localAppName = function (name) {
    for (const t of Object.keys(C.apps)) {
      const base = C.apps[t].name;
      if (name === base) return ui.templateName(t);
      if (name.startsWith(base + ' ') && /^\d+$/.test(name.slice(base.length + 1))) return ui.templateName(t) + name.slice(base.length);
    }
    return name;
  };

  ui.appName = function (app) {
    return ui.localAppName(app.name);
  };

  // A task name as stored: a feature ("Dark mode"), an update round ("Dark mode v2")
  // or a hotfix ("Fix dark mode", "Fix a crash").
  ui.taskName = function (name) {
    if (!S.featureNames) return name;
    const fix = /^Fix (.+)$/.exec(name);
    if (fix) {
      if (fix[1] === 'a crash') return S.fixCrash;
      const f = allFeatures().find((x) => x.charAt(0).toLowerCase() + x.slice(1) === fix[1]);
      return S.fixTask(f ? featureName(f) : fix[1]);
    }
    const round = /^(.*) (v\d+)$/.exec(name);
    if (round && S.featureNames[round[1]]) return featureName(round[1]) + ' ' + round[2];
    return featureName(name);
  };

  ui.agentInfo = function (kind) {
    return Object.assign({}, C.agents[kind], S.agentInfo && S.agentInfo[kind]);
  };

  // Like core.agentLabel: "Bulk Agent #2" when there are two of a kind.
  ui.agentLabel = function (s, agent) {
    const same = s.agents.filter((a) => a.kind === agent.kind);
    const name = ui.agentInfo(agent.kind).name;
    return same.length > 1 ? name + ' #' + (same.indexOf(agent) + 1) : name;
  };

  ui.achievementName = function (id) {
    return (S.achievementNames && S.achievementNames[id]) || G.core.achievement(id).name;
  };

  // A review card's title and explanation.
  ui.reviewText = function (card) {
    const t = S.reviews && S.reviews[card.id];
    return t ? { title: t.title, why: t.why } : { title: card.title, why: card.why };
  };
})(window.Game = window.Game || {});
