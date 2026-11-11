// A panel rebuilds its HTML only when its structure changes, and patches
// numbers, bar widths and button states in place the rest of the time. This
// keeps buttons stable under the cursor so clicks are never lost.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});

  ui.Panel = function (root, structure, values) {
    this.root = root;
    this.structure = structure;
    this.values = values;
    this.html = null;
    this.nodes = new Map();
  };

  ui.Panel.prototype.update = function (state) {
    const html = this.structure(state);
    if (html !== this.html) {
      this.html = html;
      this.root.innerHTML = html;
      this.nodes.clear();
      for (const el of this.root.querySelectorAll('[data-v]')) this.nodes.set(el.dataset.v, el);
    }
    if (!this.values) return;
    for (const [key, v] of this.values(state)) {
      const el = this.nodes.get(key);
      if (!el) continue;
      if (typeof v === 'string') {
        if (el.textContent !== v) el.textContent = v;
        continue;
      }
      if (v.text !== undefined && el.textContent !== v.text) el.textContent = v.text;
      if (v.width !== undefined) el.style.width = v.width;
      if (v.disabled !== undefined) el.disabled = v.disabled;
      if (v.title !== undefined) el.title = v.title;
      if (v.attr) for (const [name, value] of Object.entries(v.attr)) if (el.getAttribute(name) !== value) el.setAttribute(name, value);
      if (v.toggle) for (const [cls, on] of Object.entries(v.toggle)) el.classList.toggle(cls, on);
    }
  };
})(window.Game = window.Game || {});
