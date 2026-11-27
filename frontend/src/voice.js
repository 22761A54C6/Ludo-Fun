// Records a short voice clip from the microphone and returns it as base64 WAV
// (16 kHz mono, 16-bit), a format Gemini accepts on every browser, including iPhone Safari.
const RATE = 16000;

export const voiceSupported = () => !!(navigator.mediaDevices?.getUserMedia && (window.AudioContext || window.webkitAudioContext));

/**
 * Starts recording. Returns { stop } — call stop() to finish early; it resolves to base64 WAV.
 * Recording also stops by itself after maxMs.
 */
export async function startRecording(maxMs = 4000) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  proc.onaudioprocess = e => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  src.connect(proc); proc.connect(ctx.destination);

  let done;
  const result = new Promise(r => (done = r));
  let stopped = false;
  const stop = () => {
    if (stopped) return result;
    stopped = true; clearTimeout(timer);
    proc.disconnect(); src.disconnect(); stream.getTracks().forEach(t => t.stop());
    const rate = ctx.sampleRate; ctx.close();
    done(toWavBase64(chunks, rate));
    return result;
  };
  const timer = setTimeout(stop, maxMs);
  return { stop, result };
}

function toWavBase64(chunks, inRate) {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(len); let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  // downsample by averaging
  const ratio = inRate / RATE, outLen = Math.floor(len / ratio);
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio));
    let s = 0; for (let j = a; j < b; j++) s += all[j];
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2), d = new DataView(buf);
  const str = (p, s) => [...s].forEach((ch, i) => d.setUint8(p + i, ch.charCodeAt(0)));
  str(0, 'RIFF'); d.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, RATE, true); d.setUint32(28, RATE * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true);
  str(36, 'data'); d.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  // base64 in slices to avoid call-stack limits
  const bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
