// All sounds are synthesized with the Web Audio API: no audio files to load.
let ctx = null;
let muted = localStorage.getItem('ludo-muted') === '1';

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Browsers only allow audio after a user gesture; call this on the first tap.
export function unlockAudio() { ac(); }
export function isMuted() { return muted; }
export function setMuted(m) { muted = m; localStorage.setItem('ludo-muted', m ? '1' : '0'); }

function tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slideTo } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t); o.stop(t + dur + 0.03);
}

function noise(dur, { vol = 0.3, delay = 0, freq = 2000, q = 1 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.setValueAtTime(vol, t);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t);
}

const play = fn => (...a) => { if (muted) return; try { fn(...a); } catch { /* audio unavailable */ } };

export const sfx = {
  // dice rattling in a cup, then landing on the board
  dice: play(() => {
    for (let i = 0; i < 8; i++)
      noise(0.045, { delay: i * 0.065 + Math.random() * 0.02, freq: 1800 + Math.random() * 2600, q: 4, vol: 0.45 });
    noise(0.08, { delay: 0.56, freq: 700, q: 1.2, vol: 0.6 });
    tone(140, 0.12, { type: 'triangle', delay: 0.56, vol: 0.3 });
  }),
  // one hop per square; pitch climbs as the token travels
  step: play(i => {
    tone(480 + i * 45, 0.08, { type: 'triangle', vol: 0.2 });
    noise(0.03, { freq: 3000, q: 2, vol: 0.12 });
  }),
  // token leaves its base
  out: play(() => {
    tone(330, 0.12, { type: 'triangle', vol: 0.22 });
    tone(660, 0.18, { type: 'triangle', vol: 0.22, delay: 0.09 });
  }),
  // capture: heavy thump + falling zap
  kill: play(() => {
    tone(95, 0.35, { type: 'sine', vol: 0.55 });
    noise(0.3, { freq: 350, q: 0.6, vol: 0.7 });
    tone(700, 0.45, { type: 'sawtooth', slideTo: 60, vol: 0.18, delay: 0.03 });
  }),
  // token reaches the centre
  home: play(() => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', delay: i * 0.08, vol: 0.2 }));
  }),
  six: play(() => {
    tone(880, 0.12, { vol: 0.16 });
    tone(1320, 0.22, { vol: 0.16, delay: 0.1 });
  }),
  turn: play(() => {
    tone(660, 0.12, { vol: 0.14 });
    tone(990, 0.2, { vol: 0.12, delay: 0.11 });
  }),
  win: play(() => {
    [523, 659, 784, 659, 784, 1047].forEach((f, i) =>
      tone(f, i === 5 ? 0.6 : 0.16, { type: 'square', delay: i * 0.13, vol: 0.09 }));
    [262, 330, 392].forEach(f => tone(f, 1.2, { type: 'triangle', delay: 0.65, vol: 0.1 }));
  }),
};

// medal ceremonies (your own result)
Object.assign(sfx, {
  gold: play(() => {
    // brass-like fanfare + shimmering chord
    [[523,0,.14],[523,.15,.14],[523,.3,.14],[659,.45,.5],[587,.98,.14],[659,1.13,.14],[784,1.28,.9]]
      .forEach(([f,d,l]) => { tone(f,l,{type:'sawtooth',delay:d,vol:.07}); tone(f*2,l,{type:'triangle',delay:d,vol:.05}); });
    [1047,1319,1568,2093].forEach((f,i) => tone(f,1.4,{type:'sine',delay:1.3+i*.06,vol:.05}));
    [262,330,392].forEach(f => tone(f,1.6,{type:'triangle',delay:1.28,vol:.09}));
  }),
  silver: play(() => {
    [[440,0,.16],[554,.16,.16],[659,.32,.5],[880,.7,.8]].forEach(([f,d,l]) => { tone(f,l,{type:'triangle',delay:d,vol:.13}); tone(f*2,l*.7,{type:'sine',delay:d,vol:.04}); });
    [220,277,330].forEach(f => tone(f,1.2,{type:'triangle',delay:.7,vol:.07}));
  }),
  bronze: play(() => {
    [[392,0,.18],[494,.18,.18],[587,.36,.7]].forEach(([f,d,l]) => tone(f,l,{type:'triangle',delay:d,vol:.14}));
    [196,247,294].forEach(f => tone(f,1,{type:'triangle',delay:.36,vol:.07}));
  }),
  // descending "wah wah wah waaah"
  lost: play(() => {
    [[392,0,.32],[370,.38,.32],[349,.76,.32]].forEach(([f,d,l]) => tone(f,l,{type:'triangle',delay:d,vol:.16}));
    const c = ac(); if (!c) return;
    const t = c.currentTime + 1.16, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(330, t); o.frequency.linearRampToValueAtTime(300, t + 1.1);
    lfo.frequency.value = 6; lg.gain.value = 7; lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.17, t + .03); g.gain.exponentialRampToValueAtTime(.0001, t + 1.2);
    o.connect(g).connect(c.destination); o.start(t); lfo.start(t); o.stop(t + 1.25); lfo.stop(t + 1.25);
  }),
  // someone else finished
  medal: play(() => {
    tone(1047,.25,{vol:.1}); tone(1319,.35,{vol:.1,delay:.12}); tone(1568,.5,{vol:.08,delay:.24});
  }),
});

export const vibrate = p => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
