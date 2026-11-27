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

export const vibrate = p => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
