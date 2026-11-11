// The growth chart (2026-11-11): the run's valuation so far with a dot for
// every choice, a forecast of the next minutes, the forecast with the choice
// under the pointer, and "what if I had not done that" for a chosen dot.
// The numbers come from core/forecast.js; this file draws them and keeps the
// snapshots that the what-if needs (in memory only, so not after a reload).
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const core = G.core;
  const B = G.balance;
  const S = G.strings;
  const esc = (t) => ui.esc(t);

  const HORIZON = 120; // seconds of forecast drawn and compared
  const LOOK = 600; // seconds simulated, so a release some minutes away still counts
  const PAST = 240; // seconds of history in the default view
  const FLOOR = 1000; // valuations below this sit on the bottom line (log scale)
  const W = 600;
  const H = 210;
  const PAD = { l: 44, r: 30, t: 10, b: 22 };

  const T = (ui.timeline = {
    snaps: new Map(), // mark id -> { snap, action, t }
    previews: {}, // key -> { alt, cmp } or null when the choice is not open
    best: {}, // group -> key of the choice with the biggest effect
    base: null,
    queue: [],
    hover: null, // key of the choice under the pointer
    hoverMark: null,
    sel: null, // mark pinned by a click
    what: null, // { id, at, result }
    full: false,
  });

  // ---------- the typing rate to assume ----------

  // Recent effective keys a second, but never far below the run's average:
  // a player reading the shop has not stopped playing.
  T.kps = function (s) {
    const samples = s.log.samples;
    if (!samples.length) return 4;
    const avg = (list) => list.reduce((n, x) => n + x[2], 0) / Math.max(1, list.length);
    return Math.max(1, avg(samples.slice(-10)), 0.7 * avg(samples));
  };

  // The typing rate at a past moment, from the samples.
  function kpsAt(s) {
    const samples = s.log.samples;
    const every = B.log.sampleSeconds;
    return (t) => {
      let lo = 0;
      let hi = samples.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (samples[mid][0] < t) lo = mid + 1;
        else hi = mid;
      }
      const x = samples[Math.min(samples.length - 1, lo)];
      return x && Math.abs(x[0] - t) <= every * 4 ? x[2] : 0;
    };
  }

  // ---------- snapshots for "what if" ----------

  const CHOICES = { buyAgent: true, buyUpgrade: true, acceptAll: true, fireAgent: true };

  // Called just before an action: the state to return to, if it is a choice.
  T.before = function (s, action) {
    return CHOICES[action.type] ? JSON.stringify(s, (k, v) => (k === 'log' ? undefined : v)) : null;
  };

  T.after = function (s, action, result, snap) {
    if (!snap || !result.ok || !result.mark) return;
    T.snaps.set(result.mark.id, { snap, action, t: result.mark.t });
    if (T.snaps.size > 120) T.snaps.delete(T.snaps.keys().next().value);
    T.invalidate();
  };

  // The forecasts are out of date: a release, a stage or an outage changed the game.
  T.invalidate = function () {
    T.queue = [];
    T.due = 0;
  };

  T.reset = function () {
    T.snaps.clear();
    T.previews = {};
    T.best = {};
    T.base = null;
    T.queue = [];
    T.sel = T.hoverMark = T.what = null;
  };

  // The choices made after mark `id`, to replay in a what-if.
  function later(id) {
    const list = [];
    for (const [key, x] of T.snaps) if (key > id) list.push({ t: x.t, action: x.action });
    return list.sort((a, b) => a.t - b.t);
  }

  T.whatIf = function (s, id) {
    const x = T.snaps.get(id);
    if (!x) return null;
    const now = s.clock.runSeconds;
    if (T.what && T.what.id === id && now - T.what.at < 6) return T.what.result;
    const result = core.whatIf(x.snap, x.action, later(id), now, kpsAt(s), now - x.t > 240 ? 2 : 1);
    T.what = { id, at: now, result };
    return result;
  };

  // The choices of this run that changed the sale price the most, for the
  // result card. Runs just before the sale, while the snapshots still match.
  T.analyze = function (s) {
    const now = s.clock.runSeconds;
    const rate = kpsAt(s);
    const rows = [];
    for (const [id, x] of Array.from(T.snaps).slice(-60)) {
      const mark = s.log.marks.find((m) => m.id === id);
      if (!mark) continue;
      const r = core.whatIf(x.snap, x.action, later(id), now, rate, 2);
      rows.push({ mark, ratio: r.ratio, taken: r.taken.end, skipped: r.skipped.end });
    }
    return rows.sort((a, b) => b.ratio - a.ratio);
  };

  // ---------- forecasts for the open choices ----------

  function candidates(s) {
    const list = [];
    for (const kind of B.agentOrder) if (B.agents[kind].stage <= s.stage) list.push(['agent:' + kind, { type: 'buyAgent', kind }]);
    for (const key of Object.keys(B.shop)) if ((B.shop[key].stage || 1) <= s.stage) list.push(['up:' + key, { type: 'buyUpgrade', key }]);
    if (s.stage >= B.acceptAll.stage) list.push(['acceptAll', { type: 'acceptAll', on: !s.acceptAll.on }]);
    return list;
  }

  // The choice with the biggest effect in each list, whether or not the
  // money is there yet: knowing what to save up for is half the answer.
  function pickBest(s) {
    const best = {};
    const score = {};
    for (const [key] of candidates(s)) {
      const p = T.previews[key];
      const group = key.split(':')[0];
      if (!p || group === 'acceptAll') continue;
      const c = p.cmp;
      let value = c.saved > 0 ? c.saved * 100 : c.saved === -Infinity && c.gain > 0 && c.gain !== Infinity ? c.gain * 100 : 0;
      // the pick of the last round keeps its tag unless another is clearly better, so the tag does not jump about
      if (T.best[group] === key) value *= 1.3;
      if (value >= 5 && value > (score[group] || 0)) {
        score[group] = value;
        best[group] = key;
      }
    }
    T.best = best;
  }

  // The tag on the best choice of a list: buy it now, or save up for it.
  T.bestTag = function (s, key) {
    const group = key.split(':')[0];
    if (T.best[group] !== key) return '';
    const open = group === 'agent' ? !core.canBuyAgent(s, key.slice(6)) : !core.canBuyUpgrade(s, key.slice(3));
    return open ? S.pvBest : S.pvSaveUp;
  };

  // 45 -> "45 s", 200 -> "3 min 20 s"
  function span(seconds) {
    const n = Math.round(seconds);
    return n < 60 ? S.secondsOnly(n) : S.minutesSeconds(Math.floor(n / 60), n % 60);
  }

  // A little of the forecasting on every screen update, so typing never
  // stutters: first the forecast as things are, then one choice at a time.
  T.work = function (s, budget) {
    const now = performance.now();
    if (!T.queue.length) {
      if (now < (T.due || 0)) return;
      T.due = now + 4000;
      T.queue = [['base', null]].concat(candidates(s));
      // every forecast of this round starts from the same moment, so they compare fairly
      T.frozen = core.simClone(s);
      T.opts = { seconds: LOOK, kps: T.kps(s), dt: 1 };
      T.goalNow = T.goal(s);
    }
    const opts = T.opts;
    for (let n = 0; n < (budget || 2) && T.queue.length; n++) {
      const [key, action] = T.queue.shift();
      if (key === 'base') {
        T.base = core.forecast(T.frozen, null, opts);
        continue;
      }
      const alt = T.base ? core.forecast(T.frozen, action, opts) : null;
      T.previews[key] = alt ? { alt, goal: T.goalNow, cmp: core.compareForecasts(T.base, alt, HORIZON, T.goalNow && T.goalNow.v) } : null;
    }
    if (!T.queue.length) pickBest(s);
  };

  // One line on what a choice does: "next release 14 s sooner · +40% valuation in 2 min".
  T.line = function (key) {
    const p = T.previews[key];
    if (p === undefined) return '';
    if (p === null) return '';
    const c = p.cmp;
    const parts = [];
    // differences of a couple of seconds or percent are noise, not advice
    if (c.sooner === Infinity) parts.push(S.pvReleaseInTime);
    else if (c.sooner >= 3) parts.push(S.pvSooner(span(c.sooner)));
    else if (c.sooner <= -3 && isFinite(c.sooner)) parts.push(S.pvLater(span(-c.sooner)));
    if (p.goal && isFinite(c.goalSooner) && c.goalSooner >= 3) parts.push(S.pvGoalSooner(p.goal.label, span(c.goalSooner)));
    else if (p.goal && c.goalSooner === Infinity) parts.push(S.pvGoalInTime(p.goal.label));
    // the valuation a fixed time ahead only when no wait changes
    if (!parts.length && c.gain >= 0.02 && c.gain !== Infinity) parts.push(S.pvGain('+' + Math.round(c.gain * 100) + '%'));
    if (!parts.length && c.rate >= 0.05 && isFinite(c.rate)) parts.push(S.pvRate(Math.round(c.rate * 100)));
    if (c.outages > 0) parts.push(S.pvOutages(c.outages));
    else if (c.outages < 0) parts.push(S.pvFewerOutages(-c.outages));
    return parts.length ? S.pvPrefix + parts.join(' · ') : S.pvNothing;
  };

  // ---------- before a choice: what changes, and why ----------

  // The next line on the chart to reach: the price that lets you sell, then
  // the grades. Null at the top grade.
  T.goal = function (s) {
    const v = core.valuation(s);
    if (v < B.exit.minValuation) return { v: B.exit.minValuation, label: S.goalSell };
    const g = core.nextGrade(v);
    return g ? { v: g.from, label: S.goalGrade(g.id) } : null;
  };

  // Both forecasts for a choice, from the same moment.
  T.outlook = function (s, action) {
    const kps = T.kps(s);
    const frozen = core.simClone(s);
    const opts = { seconds: LOOK, kps, dt: 1 };
    const goal = T.goal(s);
    const base = core.forecast(frozen, null, opts);
    const alt = core.forecast(frozen, action, opts);
    return { base, alt, goal, cmp: alt ? core.compareForecasts(base, alt, HORIZON, goal && goal.v) : null, shares: core.workShares(s, kps), kps };
  };

  // 'big' | 'some' | 'small' | 'worse'. Judged by how much of the wait for
  // the next release or the next goal the choice saves; the valuation a
  // fixed time ahead jumps when a release crosses that moment, so it only
  // counts when no wait changes (an ad campaign, say).
  T.effect = function (look) {
    const c = look.cmp;
    if (!c) return 'small';
    const seconds = Math.max(isFinite(c.sooner) ? c.sooner : 0, isFinite(c.goalSooner) ? c.goalSooner : 0);
    if (c.saved >= 0.2 && (seconds >= 10 || c.saved === 1)) return 'big';
    if (c.saved >= 0.08 && seconds >= 5) return 'some';
    if (c.saved <= -0.05 && c.saved > -Infinity) return 'worse';
    if (c.saved === -Infinity || Math.abs(c.saved) < 0.08) {
      if (c.gain >= 0.25 && c.gain !== Infinity) return 'big';
      if (c.gain >= 0.03 && c.gain !== Infinity) return 'some';
      if (c.gain <= -0.05) return 'worse';
    }
    return 'small';
  };

  // The tasks an agent of this kind would start on if hired right now.
  function hireTasks(s, kind) {
    const c = core.simClone(s);
    c.money = Math.max(c.money, core.agentPrice(c, kind));
    if (!core.act(c, { type: 'buyAgent', kind }).ok) return null;
    const agent = c.agents[c.agents.length - 1];
    return agent.taskIds
      .map((id) => core.findTask(c, id))
      .filter(Boolean)
      .map((f) => {
        const was = core.findTask(s, f.task.id);
        return {
          name: f.task.name,
          building: f.app.status === 'building',
          tookOver: !!(was && was.task.assignee),
          chance: core.successChance(s, { kind }, f.task.difficulty),
        };
      });
  }

  // Sentences on why the choice does what the forecast shows.
  T.reasons = function (s, action, look) {
    const out = [];
    const sh = look.shares;
    const mine = Math.round(sh.share * 100);
    const names = (list) => Array.from(new Set(list.map((t) => ui.taskName(t.name)))).slice(0, 3).join(', ');
    if (action.type === 'buyAgent') {
      const why = core.canBuyAgent(s, action.kind);
      if (why === 'slots') return [S.whyNoDesk];
      const tasks = hireTasks(s, action.kind) || [];
      const building = tasks.filter((t) => t.building);
      if (!sh.building) out.push(S.whyAllReleased);
      else if (!tasks.length) out.push(S.whyHireIdle);
      else if (!building.length) out.push(S.whyHireOnlyUpdates);
      else {
        out.push(S.whyHireTakes(names(building)));
        if (building.some((t) => t.tookOver)) out.push(S.whyHireTakeOver);
        const lo = Math.round(Math.min(...building.map((t) => t.chance)) * 100);
        out.push(lo < 60 && !s.acceptAll.on ? S.whyHireChanceLow(lo) : S.whyHireChance(lo));
        // a small effect: its lines next to what the team already writes
        if (T.effect(look) === 'small') {
          const add = core.agentBaseSpeed(s, action.kind) * Math.min(building.length, B.agents[action.kind].concurrency);
          out.push(S.whyHireSmall(ui.num(Math.round(add * 10) / 10), ui.num(Math.round((sh.typing + sh.agents) * 10) / 10)));
        }
      }
    } else if (action.type === 'buyUpgrade') {
      const key = action.key;
      const building = (text) => (sh.building ? text : S.whyAllReleased);
      if (key === 'typing') {
        out.push(building(mine >= 50 ? S.whyTypingBig(mine) : mine < 25 ? S.whyTypingSmall(100 - mine) : S.whyTypingSome(mine)));
        if (s.agents.length) out.push(S.whyTypingBoost);
      } else if (key === 'prompt') {
        out.push(s.agents.length ? building(S.whyPrompt(s.agents.length, 100 - mine)) : S.whyPromptNone);
      } else if (key === 'review') {
        out.push(s.acceptAll.on ? S.whyReviewOn : S.whyReviewOff);
      } else if (key === 'template') {
        out.push(S.whyTemplate);
      } else if (key === 'autoCompress') {
        const n = s.agents.filter((a) => B.agents[a.kind].context > 0 && B.agents[a.kind].context < 5000).length;
        out.push(n ? S.whyAuto(n) : S.whyAutoNone);
      } else if (key === 'localGear') {
        const n = core.agentCount(s, 'local');
        out.push(n ? S.whyLocal(n) : S.whyLocalNone);
      } else if (key === 'ads') {
        out.push(S.whyAds);
      }
    } else if (action.type === 'fireAgent') {
      out.push(S.whyDismiss);
      out.push(S.whyDismissRefund(ui.money(core.agentRefund(s, action.kind))));
    }
    return out;
  };

  T.span = span;

  // ---------- drawing ----------

  const logv = (v) => Math.log10(Math.max(FLOOR, v));

  function valueAt(samples, t) {
    let v = 0;
    for (const x of samples) {
      if (x[0] > t) break;
      v = x[1];
    }
    return v;
  }

  function path(points, sx, sy) {
    return points.map((p, i) => (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ' ' + sy(p[1]).toFixed(1)).join('');
  }

  const MARK_CLASS = { hire: 'm-hire', upgrade: 'm-up', release: 'm-release', acceptOn: 'm-accept', acceptOff: 'm-accept', fire: 'm-fire', dismiss: 'm-accept' };

  T.markText = function (m) {
    if (m.k === 'hire') return S.markHire(ui.agentInfo(m.w).name);
    if (m.k === 'upgrade') return S.markUpgrade(S.upgrades[m.w] ? S.upgrades[m.w].name : m.w);
    if (m.k === 'release') return S.markRelease(ui.templateName(m.w));
    if (m.k === 'acceptOn') return S.markAcceptOn;
    if (m.k === 'acceptOff') return S.markAcceptOff;
    if (m.k === 'fire') return S.markFire;
    if (m.k === 'dismiss') return S.markDismiss(ui.agentInfo(m.w).name);
    return m.k;
  };

  // The chart as SVG. o: { samples, marks, now, base, alt, ghost, from, to,
  // sel, interactive }. Shared by the live chart and the result card.
  function svg(o) {
    const { samples, marks, now } = o;
    const from = o.from;
    const to = Math.max(o.to, from + 30);
    const visible = samples.filter((x) => x[0] >= from - 2 && x[0] <= to);
    const lines = [];
    const all = visible.map((x) => x[1]);
    for (const r of [o.base, o.alt, o.ghost]) if (r) for (const p of r) if (p[0] >= from && p[0] <= to) all.push(p[1]);
    const top = Math.max(FLOOR * 10, ...all);
    const low = Math.max(FLOOR, Math.min(top, ...all.filter((v) => v >= FLOOR)));
    // goals in reach: the price that lets you sell, and the grades
    const goals = [{ v: B.exit.minValuation, label: S.chartSellLine }].concat(B.exit.grades.filter((g) => g.from > 0).map((g) => ({ v: g.from, label: g.id })));
    const next = goals.find((g) => g.v > top);
    const hi = logv(next && next.v <= top * 300 ? next.v * 1.6 : top * 3);
    const lo = Math.max(logv(FLOOR), Math.min(logv(low) - 0.3, hi - 1.5));
    const sx = (t) => PAD.l + ((t - from) / (to - from)) * (W - PAD.l - PAD.r);
    const sy = (v) => PAD.t + (1 - (logv(v) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);

    for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
      const y = sy(Math.pow(10, d)).toFixed(1);
      lines.push(`<line class="grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}"/><text class="axis" x="${PAD.l - 6}" y="${y}" dy="3.5" text-anchor="end">${ui.money(Math.pow(10, d))}</text>`);
    }
    for (const g of goals) {
      if (logv(g.v) < lo || logv(g.v) > hi) continue;
      const y = sy(g.v).toFixed(1);
      lines.push(`<line class="goal" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y}" y2="${y}"/><text class="goal-label" x="${W - PAD.r + 4}" y="${y}" dy="3.5">${esc(g.label)}</text>`);
    }
    for (const t of [from, now, to]) {
      if (t === now && (sx(now) - sx(from) < 34 || sx(to) - sx(now) < 34)) continue;
      lines.push(`<text class="axis" x="${sx(t).toFixed(1)}" y="${H - 6}" text-anchor="${t === from ? 'start' : t === to ? 'end' : 'middle'}">${t === now && o.interactive ? esc(S.chartNow) : ui.clock(t)}</text>`);
    }
    if (o.interactive && now < to) lines.push(`<line class="now" x1="${sx(now).toFixed(1)}" x2="${sx(now).toFixed(1)}" y1="${PAD.t}" y2="${H - PAD.b}"/>`);

    const hist = visible.map((x) => [x[0], x[1]]);
    if (o.interactive && hist.length) hist.push([now, o.value]);
    const clip = (r) => r.filter((p) => p[0] >= from && p[0] <= to);
    if (o.ghost) lines.push(`<path class="ghost" d="${path(clip(o.ghost), sx, sy)}"/>`);
    if (o.base) lines.push(`<path class="fore" d="${path(clip(o.base), sx, sy)}"/>`);
    if (o.alt) lines.push(`<path class="alt" d="${path(clip(o.alt), sx, sy)}"/>`);
    if (hist.length > 1) lines.push(`<path class="hist" d="${path(hist, sx, sy)}"/>`);

    for (const m of marks) {
      if (m.t < from || m.t > to) continue;
      const cx = sx(m.t).toFixed(1);
      const cy = sy(valueAt(samples, m.t)).toFixed(1);
      const cls = (MARK_CLASS[m.k] || '') + (m.id === o.sel ? ' sel' : '');
      const act = o.interactive ? ` data-act="mark" data-mark="${m.id}"` : '';
      lines.push(`<circle class="mark ${cls}" cx="${cx}" cy="${cy}" r="${m.k === 'release' ? 7.5 : 6}"${act}><title>${ui.clock(m.t)} · ${esc(T.markText(m))}</title></circle>`);
    }
    return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(S.chartTitle)}">${lines.join('')}</svg>`;
  }

  function slice(r, seconds) {
    if (!r) return null;
    const start = r.series[0][0];
    return r.series.filter((p) => p[0] - start <= seconds);
  }

  function choiceName(key) {
    if (key === 'acceptAll') return null;
    const [group, id] = key.split(':');
    return group === 'agent' ? ui.agentInfo(id).name : S.upgrades[id].name;
  }

  // What the line under the chart says: the pinned or hovered dot, else the
  // choice under the pointer, else where things are heading.
  function caption(s) {
    const id = T.hoverMark || T.sel;
    const mark = id && s.log.marks.find((m) => m.id === id);
    if (mark) {
      const head = `${ui.clock(mark.t)} · ${esc(T.markText(mark))}`;
      const w = T.whatIf(s, mark.id);
      if (!w) return `<b>${head}</b> ${S.whatNone}`;
      const r = w.ratio;
      let text;
      if (r === Infinity || r >= 10) text = S.whatHuge(ui.money(w.skipped.end));
      else if (r >= 1.03) text = S.whatBetter(ui.money(w.skipped.end), Math.round((r - 1) * 100));
      else if (r <= 0.97) text = S.whatWorse(ui.money(w.skipped.end), Math.round((1 - r) * 100));
      else text = S.whatSame;
      return `<b>${head}</b> ${text}`;
    }
    if (T.hover && T.previews[T.hover]) {
      const name = choiceName(T.hover);
      const head = name ? S.chartIfBuy(esc(name)) : s.acceptAll.on ? S.chartIfAcceptOff : S.chartIfAcceptOn;
      return `<b class="alt-text">${head}</b> ${esc(T.line(T.hover).replace(S.pvPrefix, ''))}`;
    }
    if (!T.base) return S.chartWait;
    const rel = T.base.releases.find((r) => r.t > s.clock.runSeconds);
    const at = slice(T.base, HORIZON);
    const end = at[at.length - 1][1];
    const parts = [];
    if (rel) parts.push(S.chartNextRelease(ui.templateName(rel.template), span(Math.max(1, rel.t - s.clock.runSeconds))));
    else if (s.apps.some((a) => a.status === 'building')) parts.push(S.chartNoRelease);
    if (end > 0) parts.push(S.chartIn2Min(ui.money(end)));
    return `<b>${S.chartAsIs}</b> ${parts.join(' · ')}`;
  }

  ui.chart = {
    html(s) {
      const now = s.clock.runSeconds;
      const from = T.full ? 0 : Math.max(0, now - PAST);
      const id = T.hoverMark || T.sel;
      const w = id ? T.whatIf(s, id) : null;
      const preview = T.hover && T.previews[T.hover];
      const chart = svg({
        samples: s.log.samples,
        marks: s.log.marks,
        now,
        value: core.valuation(s),
        from,
        to: now + HORIZON,
        base: slice(T.base, HORIZON),
        alt: preview ? slice(preview.alt, HORIZON) : null,
        ghost: w ? w.skipped.series : null,
        sel: id,
        interactive: true,
      });
      return (
        `<div class="chart-head"><b>${S.chartTitle}</b>` +
        `<span class="legend"><i class="l-hist"></i>${S.legendPast}<i class="l-fore"></i>${S.legendFuture}<i class="l-mark"></i>${S.legendChoice}</span>` +
        `<button class="link" data-act="chartRange">${T.full ? S.chartRecent : S.chartWhole}</button></div>` +
        chart +
        `<p class="chart-cap">${caption(s)}</p>`
      );
    },

    // Before a choice: the forecast as things are against the forecast with
    // the choice, from a minute ago to a little past the next release.
    choiceHtml(s, look) {
      const now = s.clock.runSeconds;
      const rel = [look.base, look.alt].map((r) => (r && r.releases.length ? r.releases[0].t - now : 0));
      const seconds = Math.max(120, Math.min(LOOK, Math.max(...rel) + 45));
      return svg({
        samples: s.log.samples,
        marks: [],
        now,
        value: core.valuation(s),
        from: Math.max(0, now - 60),
        to: now + seconds,
        base: slice(look.base, seconds),
        alt: look.alt ? slice(look.alt, seconds) : null,
        interactive: true,
      });
    },

    // Before a choice: how far along the app being built gets over time, as
    // things are and with the choice. Linear, so a few seconds show: the
    // lines end where the app is done.
    progressHtml(s, look) {
      const now = s.clock.runSeconds;
      const lines = [look.base.progress, look.alt.progress];
      if (!lines[0].length || !lines[1].length) return '';
      const ends = lines.map((p) => (p[p.length - 1][1] >= 1 ? p[p.length - 1][0] - now : null));
      const reach = Math.max(...ends.map((e) => (e == null ? LOOK : e)));
      const to = Math.max(20, reach * 1.08);
      const w = 600;
      const h = 150;
      const pad = { l: 40, r: 14, t: 16, b: 22 };
      const sx = (t) => pad.l + ((t - now) / to) * (w - pad.l - pad.r);
      const sy = (f) => pad.t + (1 - f) * (h - pad.t - pad.b);
      const parts = [];
      for (const f of [0, 0.5, 1]) {
        const y = sy(f).toFixed(1);
        parts.push(`<line class="${f === 1 ? 'goal' : 'grid'}" x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}"/><text class="axis" x="${pad.l - 6}" y="${y}" dy="3.5" text-anchor="end">${f * 100}%</text>`);
      }
      const step = to > 360 ? 120 : to > 150 ? 60 : to > 60 ? 30 : 10;
      for (let t = 0; t <= to; t += step) {
        parts.push(`<text class="axis" x="${sx(now + t).toFixed(1)}" y="${h - 6}" text-anchor="${t ? 'middle' : 'start'}">${t ? '+' + ui.clock(t) : esc(S.chartNow)}</text>`);
      }
      const cls = ['fore', 'alt'];
      // the choice's line on top; each end gets a dot and its time
      [0, 1].forEach((i) => {
        const p = lines[i].filter((x) => x[0] - now <= to);
        parts.push(`<path class="${cls[i]}" d="${path(p, sx, sy)}"/>`);
      });
      [0, 1].forEach((i) => {
        if (ends[i] == null) return;
        const x = sx(now + ends[i]);
        const above = i === 1 || ends[0] == null || Math.abs(ends[0] - ends[1]) / to > 0.12;
        parts.push(`<circle class="end ${cls[i]}" cx="${x.toFixed(1)}" cy="${sy(1).toFixed(1)}" r="5"/>`);
        // when the two ends are close, the second label goes under the line
        parts.push(`<text class="end-label ${cls[i]}" x="${x.toFixed(1)}" y="${(sy(1) + (above ? -7 : 16)).toFixed(1)}" text-anchor="middle">${ui.clock(ends[i])}</text>`);
      });
      return `<svg class="chart-svg progress-svg" viewBox="0 0 ${w} ${h}" role="img">${parts.join('')}</svg>`;
    },

    // The whole run with its choices, for the result card.
    resultHtml(log, seconds) {
      if (!log || log.samples.length < 2) return '';
      return svg({ samples: log.samples, marks: log.marks, now: seconds, from: 0, to: seconds, interactive: false });
    },
  };
})(window.Game = window.Game || {});
