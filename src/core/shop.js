// Things bought with money and switches the player flips (FR-04, FR-10, FR-24):
// skills and upgrades, energy drinks, Accept All and auto-compacting.
(function (G) {
  'use strict';
  const core = (G.core = G.core || {});
  const B = G.balance;

  // Current level of each upgrade. Auto-compacting counts its unlock as level 1.
  const LEVEL = {
    typing: (s) => s.dev.typing,
    prompt: (s) => s.dev.prompt,
    review: (s) => s.dev.review,
    template: (s) => s.upgrades.template,
    autoCompress: (s) => s.upgrades.autoCompress + 1,
    localGear: (s) => s.upgrades.localGear,
    ads: (s) => s.upgrades.ads,
  };
  const APPLY = {
    typing: (s) => (s.dev.typing += 1),
    prompt: (s) => (s.dev.prompt += 1),
    review: (s) => (s.dev.review += 1),
    template: (s) => (s.upgrades.template += 1),
    autoCompress: (s) => (s.upgrades.autoCompress += 1),
    localGear: (s) => (s.upgrades.localGear += 1),
    ads: (s) => (s.upgrades.ads += 1),
  };

  core.upgradeLevel = function (s, key) {
    return LEVEL[key] ? LEVEL[key](s) : 0;
  };

  core.upgradeMax = function (key) {
    const u = B.shop[key];
    return u.prices ? u.prices.length : u.max;
  };

  core.upgradePrice = function (s, key) {
    const u = B.shop[key];
    const level = core.upgradeLevel(s, key);
    if (level >= core.upgradeMax(key)) return Infinity;
    return u.prices ? u.prices[level] : u.base * Math.pow(u.growth, level);
  };

  core.canBuyUpgrade = function (s, key) {
    const u = B.shop[key];
    if (!u) return 'unknown';
    if ((u.stage || 1) > s.stage) return 'locked';
    const price = core.upgradePrice(s, key);
    if (price === Infinity) return 'max';
    if (s.money < price) return 'money';
    return null;
  };

  core.buyUpgrade = function (s, key, out) {
    if (core.canBuyUpgrade(s, key)) return false;
    s.money -= core.upgradePrice(s, key);
    APPLY[key](s);
    out.push({ type: 'upgraded', key, level: core.upgradeLevel(s, key) });
    return true;
  };

  // ---------- energy drink ----------

  core.drinkPrice = function (s) {
    return Math.max(B.drink.minPrice, core.steadyRevenue(s) * B.drink.revenueMinutes);
  };

  core.drinkCooldown = function (s) {
    return Math.max(0, s.caffeine.drinkReadyAt - s.clock.totalSeconds);
  };

  core.canDrink = function (s) {
    if (core.feverActive(s)) return 'fever';
    if (core.drinkCooldown(s) > 0) return 'cooldown';
    if (s.money < core.drinkPrice(s)) return 'money';
    return null;
  };

  core.drink = function (s, out) {
    if (core.canDrink(s)) return false;
    s.money -= core.drinkPrice(s);
    s.caffeine.drinkReadyAt = s.clock.totalSeconds + B.drink.cooldownSeconds;
    core.startFever(s, out);
    return true;
  };

  // ---------- switches ----------

  core.setAcceptAll = function (s, on) {
    if (s.stage < B.acceptAll.stage) return false;
    s.acceptAll.on = !!on;
    return true;
  };

  core.setAutoCompress = function (s, on) {
    if (s.upgrades.autoCompress < 0) return false;
    s.upgrades.autoCompressOn = !!on;
    return true;
  };
})(window.Game = window.Game || {});
