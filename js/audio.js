// Audio (SPEC §8): unlocked on first tap; routed (majlis = host-only event sounds).
// Sounds are SYNTHESIZED with WebAudio so the game has audio with zero asset files.
// If a same-named mp3 is dropped into assets/sfx/ later, it transparently overrides
// the synth — honoring SPEC's "code against these names + graceful fallback".

const NAMES = ['wolf-howl', 'rooster', 'sword', 'drum', 'save', 'card-flip', 'win-village', 'win-wolves', 'night-wind'];
// event sounds: in majlis mode they play on the HOST device only; personal ones play locally
const EVENT = new Set(['wolf-howl', 'rooster', 'sword', 'drum', 'save', 'win-village', 'win-wolves', 'night-wind']);

let ctx = null, master = null, loopStop = null, loopName = null;
const buffers = {};            // name → AudioBuffer (only if an mp3 was found)
let muted = localStorage.getItem('wolf_muted') === '1';
let routing = { mode: 'majlis', isHost: false };

export const isMuted = () => muted;
export function setRouting(mode, isHost) { routing = { mode, isHost }; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('wolf_muted', muted ? '1' : '0');
  // master gain alone silences/restores everything — keep the ambient loop node alive
  // through a mute so unmuting resumes it (don't tear it down here).
  if (master) master.gain.value = muted ? 0 : 1;
  return muted;
}

export async function unlock() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    await ctx.resume();
    // optional: pick up real mp3s if a human added them (overrides synth)
    NAMES.forEach(async name => {
      try {
        const res = await fetch(`assets/sfx/${name}.mp3`);
        if (!res.ok) return;
        buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch { /* none → synth is used */ }
    });
  } catch { /* no AudioContext → game still fully playable, just silent */ }
}

function allowed(name) {
  if (!ctx) return false;
  if (EVENT.has(name) && routing.mode === 'majlis' && !routing.isHost) return false;
  return true;
}

const now = () => ctx.currentTime;

// ---- low-level synth helpers ----
function tone(freq, t0, dur, { type = 'sine', gain = 0.3, glideTo = null, attack = 0.01, dest = null } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(dest || master);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function noise(t0, dur, { gain = 0.3, lp = 4000, hp = 0, dest = null } = {}) {
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = src;
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node.connect(f); node = f; }
  if (hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node.connect(f); node = f; }
  node.connect(g); g.connect(dest || master);
  src.start(t0); src.stop(t0 + dur + 0.02);
}

// ---- one synth per named sound ----
const SYNTH = {
  'wolf-howl'() {
    const t = now();
    tone(220, t, 1.4, { type: 'sawtooth', gain: 0.22, glideTo: 660, attack: 0.25 });
    tone(330, t + 0.1, 1.3, { type: 'sine', gain: 0.12, glideTo: 620 });
  },
  rooster() {
    const t = now();
    [880, 1180, 760, 1040].forEach((f, i) => tone(f, t + i * 0.12, 0.14, { type: 'square', gain: 0.14 }));
  },
  sword() {
    const t = now();
    noise(t, 0.18, { gain: 0.5, hp: 1200, lp: 8000 });
    tone(2400, t + 0.02, 0.3, { type: 'triangle', gain: 0.12, glideTo: 600 });
  },
  drum() {
    const t = now();
    tone(150, t, 0.3, { type: 'sine', gain: 0.5, glideTo: 55 });
    noise(t, 0.06, { gain: 0.2, lp: 2000 });
  },
  save() {
    const t = now();
    [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.09, 0.4, { type: 'sine', gain: 0.16 }));
  },
  'card-flip'() {
    const t = now();
    noise(t, 0.09, { gain: 0.22, hp: 800, lp: 6000 });
  },
  'win-village'() {
    const t = now();
    [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, t + i * 0.13, 0.6, { type: 'triangle', gain: 0.18 }));
  },
  'win-wolves'() {
    const t = now();
    [233, 277, 311].forEach(f => tone(f, t, 1.4, { type: 'sawtooth', gain: 0.13 }));
    tone(110, t, 1.6, { type: 'sine', gain: 0.2, glideTo: 70 });
  },
};

export function play(name) {
  if (!allowed(name)) return;
  try {
    if (buffers[name]) { // real mp3 present → use it
      const s = ctx.createBufferSource();
      s.buffer = buffers[name]; s.connect(master); s.start();
    } else if (SYNTH[name]) {
      SYNTH[name]();
    }
  } catch { }
}

// looping ambient (night-wind): low filtered noise bed
export function loop(name, on) {
  if (!on) { try { loopStop?.(); } catch { } loopStop = null; loopName = null; return; }
  if (loopName === name && loopStop) return;
  loopName = name;
  if (!allowed(name)) return;
  try {
    if (buffers[name]) {
      const g = ctx.createGain(); g.gain.value = 0.22; g.connect(master);
      const s = ctx.createBufferSource(); s.buffer = buffers[name]; s.loop = true; s.connect(g); s.start();
      loopStop = () => { try { s.stop(); } catch { } };
    } else {
      // synth wind: pink-ish noise through a slow-wandering lowpass
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * 0.04) * 0.98; d[i] = last; }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const lfo = ctx.createOscillator(); const lfoG = ctx.createGain();
      lfo.frequency.value = 0.08; lfoG.gain.value = 220; lfo.connect(lfoG); lfoG.connect(f.frequency);
      const g = ctx.createGain(); g.gain.value = 0.5;
      src.connect(f); f.connect(g); g.connect(master);
      src.start(); lfo.start();
      loopStop = () => { try { src.stop(); lfo.stop(); } catch { } };
    }
  } catch { }
}
