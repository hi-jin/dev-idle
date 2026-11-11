// Sound effects made with Web Audio oscillators, so there are no sound files
// (FR-32). Browsers only allow audio after a key press or tap, so the audio
// context starts on the first one. Muting is remembered in this browser.
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});

  const KEY = 'devidle.muted';
  // Caffeine mode climbs this scale with the streak (C major pentatonic, two octaves).
  const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  const lastPlayed = {};
  try {
    muted = window.localStorage.getItem(KEY) === '1';
  } catch (e) {
    // no storage: sound starts on
  }

  function start() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    ctx = new Ctx();
    const limiter = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(limiter).connect(ctx.destination);
    noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  for (const ev of ['keydown', 'pointerdown']) document.addEventListener(ev, start, true);

  // One note: a wave that rises fast and fades out. `to` slides the pitch.
  function tone(o) {
    const t = ctx.currentTime + (o.at || 0);
    const dur = o.dur || 0.12;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(o.gain || 0.2, t + (o.attack || 0.006));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // A short click of filtered noise, for keys.
  function click(gain, freq) {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(filter).connect(env).connect(master);
    src.start(t);
    src.stop(t + 0.05);
  }

  // Notes one after another, `step` seconds apart, starting `o.at` seconds from now.
  function notes(freqs, step, o) {
    freqs.forEach((freq, i) => tone(Object.assign({}, o, { freq, at: (o.at || 0) + i * step })));
  }

  const SOUNDS = {
    key: () => click(0.15, 1800 + Math.random() * 900),
    // the n-th right key in a row in caffeine mode; every 10th also rings
    streak: (n) => {
      tone({ freq: SCALE[n % SCALE.length], type: 'triangle', dur: 0.09, gain: 0.09 });
      if (n > 0 && n % 10 === 0) notes([1567.98, 2093], 0.06, { type: 'sine', dur: 0.18, gain: 0.08 });
    },
    miss: () => tone({ freq: 140, to: 90, type: 'square', dur: 0.12, gain: 0.07 }),
    buy: () => notes([987.77, 1318.51], 0.07, { type: 'square', dur: 0.12, gain: 0.05 }),
    hire: () => notes([392, 587.33, 783.99], 0.07, { type: 'square', dur: 0.1, gain: 0.05 }),
    release: () => notes([523.25, 659.25, 783.99, 1046.5], 0.08, { type: 'triangle', dur: 0.25, gain: 0.16 }),
    stage: () => {
      notes([392, 523.25, 659.25, 783.99], 0.09, { type: 'triangle', dur: 0.22, gain: 0.16 });
      [523.25, 659.25, 783.99, 1046.5].forEach((freq) => tone({ freq, type: 'sine', dur: 0.9, gain: 0.08, at: 0.38 }));
    },
    achievement: () => notes([1318.51, 1567.98, 2093, 2637], 0.06, { type: 'sine', dur: 0.3, gain: 0.08 }),
    feverStart: () => {
      tone({ freq: 220, to: 1320, type: 'sawtooth', dur: 0.4, gain: 0.05 });
      notes([783.99, 1046.5], 0.08, { type: 'triangle', dur: 0.2, gain: 0.12, at: 0.32 });
    },
    feverEnd: () => notes([783.99, 523.25], 0.1, { type: 'triangle', dur: 0.2, gain: 0.1 }),
    right: () => notes([1046.5, 1567.98], 0.07, { type: 'sine', dur: 0.3, gain: 0.14 }),
    wrong: () => notes([196, 155.56], 0.09, { type: 'square', dur: 0.16, gain: 0.07 }),
    failed: () => tone({ freq: 330, to: 110, type: 'triangle', dur: 0.32, gain: 0.14 }),
    outage: () => [0, 0.16, 0.32].forEach((at) => tone({ freq: at === 0.16 ? 330 : 440, type: 'square', dur: 0.13, gain: 0.06, at })),
    pop: () => tone({ freq: 620, to: 980, type: 'sine', dur: 0.12, gain: 0.14 }),
    warn: () => notes([440, 349.23], 0.1, { type: 'triangle', dur: 0.16, gain: 0.1 }),
    sale: () => {
      notes([392, 523.25, 659.25, 783.99, 1046.5], 0.1, { type: 'triangle', dur: 0.25, gain: 0.16 });
      [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((freq) => tone({ freq, type: 'sine', dur: 1.3, gain: 0.07, at: 0.5 }));
    },
  };

  ui.sound = {
    get muted() {
      return muted;
    },
    setMuted(on) {
      muted = !!on;
      try {
        window.localStorage.setItem(KEY, muted ? '1' : '0');
      } catch (e) {
        // the choice lasts until the page closes
      }
    },
    // The same sound at most every 40 ms, so a batch of notes does not stack up.
    play(name, arg) {
      if (muted || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
      const now = performance.now();
      if (now - (lastPlayed[name] || 0) < 40) return;
      lastPlayed[name] = now;
      SOUNDS[name](arg);
    },
  };
})(window.Game = window.Game || {});
