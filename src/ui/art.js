// Flat SVG art: the room for each stage, the developer seen from behind, and
// the five agent robots. Everything is drawn in a 360 x 230 scene.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});

  ui.SCENE_W = 360;
  ui.SCENE_H = 230;

  const INK = '#2C2C2A';
  const SKIN = '#F5C4B3';

  // wall, floor, clothes and the room's props for each developer stage
  const THEMES = {
    1: { wall: '#EDE9E1', floor: '#D3CEC3', top: '#A7B4C2', topDark: '#8496A8', hair: '#444441', extra: 'none', props: ['smallWindow', 'ramen'] },
    2: { wall: '#F4E7D9', floor: '#D9C3AA', top: '#7F77DD', topDark: '#534AB7', hair: '#5F4A3A', extra: 'headphones', props: ['cafeWindow', 'lamp', 'plantLeft', 'coffee'] },
    3: { wall: '#E1F0EA', floor: '#C5D8CF', top: '#1D9E75', topDark: '#0F6E56', hair: '#444441', extra: 'headphones', props: ['twoWindows', 'poster', 'plantLeft', 'coffee'] },
    4: { wall: '#E4EBF4', floor: '#C7D2E0', top: '#185FA5', topDark: '#0C447C', hair: '#2C2C2A', extra: 'collar', props: ['cityWindow', 'whiteboard', 'coffee'] },
    5: { wall: '#ECE8F4', floor: '#CFC8DD', top: '#2C2C2A', topDark: '#1A1A19', hair: '#1A1A19', extra: 'suit', props: ['skyline', 'plantLeft', 'trophy'] },
  };

  const PROPS = {
    smallWindow: () =>
      '<rect x="30" y="24" width="64" height="50" rx="4" fill="#B5D4F4"/><path d="M62 24v50M30 49h64" stroke="#E6F1FB" stroke-width="3"/>' +
      '<rect x="26" y="74" width="72" height="5" rx="2" fill="#B4B2A9"/>',
    cafeWindow: () =>
      '<rect x="26" y="30" width="86" height="56" rx="4" fill="#B5D4F4"/><path d="M69 30v56" stroke="#E6F1FB" stroke-width="3"/>' +
      '<path d="M20 22h98l-6 14H26z" fill="#F0997B"/><path d="M38 22l-3 14M58 22l-2 14M80 22l2 14M100 22l3 14" stroke="#FAECE7" stroke-width="5"/>',
    lamp: () => '<path d="M180 0v18" stroke="#888780" stroke-width="2"/><path d="M166 30a14 12 0 0 1 28 0z" fill="#EF9F27"/>',
    twoWindows: () =>
      '<rect x="24" y="24" width="44" height="58" rx="4" fill="#B5D4F4"/><rect x="76" y="24" width="44" height="58" rx="4" fill="#B5D4F4"/>' +
      '<path d="M24 53h44M76 53h44" stroke="#E6F1FB" stroke-width="3"/>',
    poster: () =>
      '<rect x="262" y="26" width="64" height="44" rx="3" fill="#FAC775"/>' +
      '<text x="294" y="53" text-anchor="middle" font-size="13" font-weight="700" fill="#633806" font-family="system-ui, sans-serif">SHIP IT</text>',
    cityWindow: () =>
      '<rect x="20" y="20" width="96" height="70" rx="4" fill="#B5D4F4"/>' +
      '<path d="M28 90V58h14v32M46 90V44h16v46M66 90V64h12v26M82 90V50h16v40M102 90V68h10v22" fill="#85B7EB"/>' +
      '<path d="M68 20v70" stroke="#E6F1FB" stroke-width="3"/>',
    whiteboard: () =>
      '<rect x="248" y="22" width="90" height="62" rx="4" fill="#FFFFFF" stroke="#B4B2A9" stroke-width="2"/>' +
      '<rect x="258" y="32" width="16" height="16" fill="#FAC775"/><rect x="280" y="32" width="16" height="16" fill="#9FE1CB"/>' +
      '<rect x="302" y="32" width="16" height="16" fill="#F4C0D1"/><rect x="258" y="54" width="16" height="16" fill="#CECBF6"/>' +
      '<path d="M282 62h44M282 70h30" stroke="#B4B2A9" stroke-width="2"/>',
    skyline: () =>
      '<rect x="16" y="14" width="328" height="74" rx="4" fill="#CECBF6"/>' +
      '<path d="M16 88V60h20V40h18v48h14V52h22v36h16V30h20v58h18V56h16v32h24V44h20v44h14V60h22v28h18V48h20v40h24V58h18v30z" fill="#AFA9EC"/>' +
      '<path d="M180 14v74" stroke="#EEEDFE" stroke-width="3"/>',
    ramen: () =>
      '<path d="M308 140h26l-3 10h-20z" fill="#F0997B"/><path d="M314 134q2-6 0-10M322 134q2-6 0-10" stroke="#B4B2A9" stroke-width="2" fill="none"/>',
    coffee: () => '<rect x="312" y="134" width="16" height="16" rx="3" fill="#FFFFFF" stroke="#B4B2A9" stroke-width="2"/><path d="M328 138h4v6h-4" stroke="#B4B2A9" stroke-width="2" fill="none"/>',
    plantLeft: () =>
      '<rect x="26" y="134" width="20" height="16" rx="3" fill="#D85A30"/>' +
      '<path d="M36 134c-10-8-12-18-4-22 4 8 4 14 4 22zM36 134c8-10 16-12 18-6-6 4-12 6-18 6z" fill="#639922"/>',
    trophy: () =>
      '<path d="M310 118h24v8a12 12 0 0 1-24 0z" fill="#EF9F27"/><rect x="319" y="136" width="6" height="6" fill="#BA7517"/><rect x="312" y="142" width="20" height="8" rx="2" fill="#854F0B"/>',
  };

  function room(t) {
    return (
      `<rect width="360" height="230" fill="${t.wall}"/>` +
      `<rect y="188" width="360" height="42" fill="${t.floor}"/>` +
      t.props.map((p) => PROPS[p]()).join('') +
      // desk, legs and monitor
      '<rect x="14" y="150" width="332" height="10" rx="3" fill="#B4B2A9"/>' +
      '<rect x="24" y="160" width="8" height="30" fill="#888780"/><rect x="328" y="160" width="8" height="30" fill="#888780"/>' +
      `<rect x="116" y="42" width="128" height="90" rx="7" fill="${INK}"/>` +
      '<rect x="172" y="132" width="16" height="18" fill="#5F5E5A"/><rect x="156" y="146" width="48" height="5" rx="2" fill="#5F5E5A"/>'
    );
  }

  function developer(t) {
    let extra = '';
    if (t.extra === 'headphones') {
      extra =
        '<path d="M160 150a20 22 0 0 1 40 0" stroke="#2C2C2A" stroke-width="4" fill="none"/>' +
        '<rect x="155" y="144" width="8" height="16" rx="3" fill="#2C2C2A"/><rect x="197" y="144" width="8" height="16" rx="3" fill="#2C2C2A"/>';
    } else if (t.extra === 'collar' || t.extra === 'suit') {
      // the back of a shirt collar above the jacket
      extra = '<rect x="168" y="161" width="24" height="6" rx="3" fill="#FFFFFF"/>';
    }
    return (
      '<g class="dev">' +
      `<rect x="138" y="172" width="84" height="64" rx="26" fill="${t.top}"/>` +
      `<rect x="154" y="162" width="52" height="20" rx="10" fill="${t.topDark}"/>` +
      // back of the head: neck, ears, then hair over the whole head
      `<rect x="172" y="158" width="16" height="10" rx="3" fill="${SKIN}"/>` +
      `<ellipse cx="161" cy="150" rx="4" ry="6" fill="${SKIN}"/><ellipse cx="199" cy="150" rx="4" ry="6" fill="${SKIN}"/>` +
      `<circle cx="180" cy="146" r="19" fill="${t.hair}"/>` +
      '<path d="M168 134q8-6 18-3" stroke="#FFFFFF" stroke-opacity="0.18" stroke-width="3" stroke-linecap="round" fill="none"/>' +
      extra +
      `<g class="hand hand-l"><rect x="122" y="148" width="28" height="11" rx="5.5" fill="${t.top}"/></g>` +
      `<g class="hand hand-r"><rect x="210" y="148" width="28" height="11" rx="5.5" fill="${t.top}"/></g>` +
      '</g>'
    );
  }

  // Robots are drawn with their bottom centre at (0, 0).
  const ROBOTS = {
    auto: () =>
      '<rect x="-14" y="-26" width="28" height="24" rx="7" fill="#9FE1CB"/>' +
      '<circle cx="-5" cy="-15" r="2.6" fill="#04342C"/><circle cx="5" cy="-15" r="2.6" fill="#04342C"/>' +
      '<path d="M-4 -8h8" stroke="#04342C" stroke-width="1.6" stroke-linecap="round"/>' +
      '<rect x="-9" y="-3" width="18" height="3" rx="1.5" fill="#5DCAA5"/>',
    bulk: () =>
      '<path d="M0 -40v-8" stroke="#1D9E75" stroke-width="2"/><circle cy="-50" r="3" fill="#1D9E75"/>' +
      '<rect x="-21" y="-40" width="42" height="32" rx="8" fill="#5DCAA5"/>' +
      '<circle cx="-8" cy="-26" r="3.6" fill="#04342C"/><circle cx="8" cy="-26" r="3.6" fill="#04342C"/>' +
      '<rect x="-12" y="-17" width="24" height="4" rx="2" fill="#0F6E56"/>' +
      '<rect x="-16" y="-8" width="10" height="8" rx="2" fill="#1D9E75"/><rect x="6" y="-8" width="10" height="8" rx="2" fill="#1D9E75"/>',
    precise: () =>
      '<rect x="-10" y="-10" width="20" height="10" rx="3" fill="#D85A30"/>' +
      '<circle cy="-24" r="16" fill="#F0997B"/>' +
      '<circle cy="-24" r="7" fill="#FFFFFF"/><circle cy="-24" r="3.4" fill="#712B13"/>' +
      '<path d="M-16 -36l-5 -6M16 -36l5 -6" stroke="#D85A30" stroke-width="2" stroke-linecap="round"/>',
    longctx: () =>
      '<rect x="-13" y="-48" width="26" height="46" rx="8" fill="#AFA9EC"/>' +
      '<circle cx="-5" cy="-36" r="2.6" fill="#26215C"/><circle cx="5" cy="-36" r="2.6" fill="#26215C"/>' +
      '<rect x="8" y="-26" width="14" height="24" rx="2" fill="#FFFFFF" stroke="#7F77DD" stroke-width="1.5"/>' +
      '<path d="M11 -20h8M11 -15h8M11 -10h6" stroke="#AFA9EC" stroke-width="1.5"/>',
    local: () =>
      '<rect x="-13" y="-42" width="26" height="40" rx="4" fill="#B4B2A9"/>' +
      '<rect x="-9" y="-37" width="18" height="12" rx="2" fill="#2C2C2A"/>' +
      '<circle cx="-4" cy="-31" r="1.8" fill="#97C459"/><circle cx="4" cy="-31" r="1.8" fill="#97C459"/>' +
      '<circle cy="-14" r="6" fill="none" stroke="#5F5E5A" stroke-width="2"/><path d="M-4 -14h8M0 -18v8" stroke="#5F5E5A" stroke-width="1.5"/>',
  };

  const ROBOT_TOP = { auto: -26, bulk: -52, precise: -42, longctx: -48, local: -42 };

  function bubble(cls, text, top) {
    const w = Math.max(20, text.length * 7 + 10);
    return (
      `<g class="bubble ${cls}"><rect x="${-w / 2}" y="${top - 22}" width="${w}" height="16" rx="8" fill="#FFFFFF" stroke="#D3D1C7"/>` +
      `<text y="${top - 10.5}" text-anchor="middle" font-size="10" font-family="system-ui, sans-serif" fill="#444441">${text}</text></g>`
    );
  }

  // A robot with its state bubbles. The outer group places it; the inner
  // group is what CSS animates.
  ui.robotSvg = function (kind, x, y, id) {
    const top = ROBOT_TOP[kind];
    return (
      `<g transform="translate(${x} ${y})"><g class="bot" data-bot="${id}"><g class="bot-body">${ROBOTS[kind]()}</g>` +
      bubble('b-idle', '?', top) +
      bubble('b-paused', '$0', top) +
      bubble('b-limited', 'zzz', top) +
      bubble('b-full', 'full', top) +
      bubble('b-oops', 'oops', top) +
      '</g></g>'
    );
  };

  // The developer's head from behind, for "you" markers.
  ui.devIcon = function () {
    return (
      '<svg class="icon-svg" viewBox="156 124 48 44" aria-hidden="true">' +
      `<ellipse cx="161" cy="150" rx="4" ry="6" fill="${SKIN}"/><ellipse cx="199" cy="150" rx="4" ry="6" fill="${SKIN}"/>` +
      '<circle cx="180" cy="146" r="19" fill="#444441"/></svg>'
    );
  };

  // A small standalone icon of a robot for lists.
  ui.robotIcon = function (kind) {
    return `<svg class="icon-svg" viewBox="-26 -56 52 58" aria-hidden="true">${ROBOTS[kind]()}</svg>`;
  };

  // desk spots first, then the floor in front
  ui.ROBOT_SLOTS = [
    [86, 149],
    [274, 149],
    [34, 228],
    [92, 228],
    [268, 228],
    [326, 228],
  ];

  ui.sceneSvg = function (stage, agents) {
    const t = THEMES[stage] || THEMES[1];
    // With more agents than slots, the last slot shows "+N" instead of a robot.
    const slots = ui.ROBOT_SLOTS.length;
    const shown = agents.length > slots ? agents.slice(0, slots - 1) : agents;
    const robots = shown.map((a, i) => ui.robotSvg(a.kind, ui.ROBOT_SLOTS[i][0], ui.ROBOT_SLOTS[i][1], a.id)).join('');
    const more = agents.length - shown.length;
    const [bx, by] = ui.ROBOT_SLOTS[slots - 1];
    const badge = more > 0
      ? `<g transform="translate(${bx} ${by - 16})"><rect x="-20" y="-13" width="40" height="24" rx="12" fill="#FFFFFF" stroke="#D3D1C7"/><text y="4" text-anchor="middle" font-size="12" font-weight="600" font-family="system-ui, sans-serif" fill="#444441">+${more}</text></g>`
      : '';
    return (
      `<svg viewBox="0 0 360 230" aria-hidden="true">` + room(t) + developer(t) + robots + badge + '</svg>'
    );
  };
})(window.Game = window.Game || {});
