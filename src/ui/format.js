// Number formatting for the interface (spec section 9).
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});

  const UNITS = [
    [1e18, 'Qi'],
    [1e15, 'Qa'],
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];

  ui.num = function (n) {
    if (!isFinite(n)) return '∞';
    const abs = Math.abs(n);
    for (let i = 0; i < UNITS.length; i++) {
      const [size, unit] = UNITS[i];
      if (abs >= size) {
        const v = n / size;
        // 2K, 1.5K, 12.3K, 450K
        const text = String(Number(v.toFixed(Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2)));
        // 999.99M rounds to "1000M"; show it as 1B instead
        if (Math.abs(Number(text)) >= 1000 && i > 0) return String(Number((n / UNITS[i - 1][0]).toFixed(2))) + UNITS[i - 1][1];
        return text + unit;
      }
    }
    if (abs >= 100 || Number.isInteger(n)) return Math.round(n).toLocaleString('en-US');
    // 0.25, 1.5, 12.3
    return String(Number(n.toFixed(abs < 10 ? 2 : 1)));
  };

  // $3.25, $32.50, $432, $1.23K
  ui.money = function (n) {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-$' : '$';
    if (abs < 1000) return sign + abs.toFixed(abs < 100 ? 2 : 0);
    return sign + ui.num(abs);
  };

  // 75 -> "1:15"
  ui.clock = function (seconds) {
    const t = Math.max(0, Math.ceil(seconds));
    return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  };

  ui.pct = function (p) {
    return Math.round(p * 100);
  };

  ui.esc = function (text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  };
})(window.Game = window.Game || {});
