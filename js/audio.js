// Audio: WebAudio unlocked on first tap; graceful no-op for missing files (SPEC §8).
const NAMES = ['wolf-howl', 'rooster', 'sword', 'drum', 'save', 'card-flip', 'win-village', 'win-wolves', 'night-wind'];
// event sounds: in majlis mode they play on the HOST device only; personal ones play locally
const EVENT = new Set(['wolf-howl', 'rooster', 'sword', 'drum', 'save', 'win-village', 'win-wolves', 'night-wind']);

let ctx = null, master = null, loopNode = null, loopName = null;
const buffers = {};
let muted = localStorage.getItem('wolf_muted') === '1';
let routing = { mode: 'majlis', isHost: false };

export const isMuted = () => muted;
export function setRouting(mode, isHost) { routing = { mode, isHost }; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('wolf_muted', muted ? '1' : '0');
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
    NAMES.forEach(async name => {
      try {
        const res = await fetch(`assets/sfx/${name}.mp3`);
        if (!res.ok) return;
        buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
        if (name === loopName) startLoopNode(); // loop was requested before file finished loading
      } catch { /* missing asset → silent */ }
    });
  } catch { /* no AudioContext → game still playable */ }
}

function allowed(name) {
  if (!ctx || !buffers[name]) return false;
  if (EVENT.has(name) && routing.mode === 'majlis' && !routing.isHost) return false;
  return true;
}

export function play(name) {
  if (!allowed(name)) return;
  try {
    const s = ctx.createBufferSource();
    s.buffer = buffers[name];
    s.connect(master);
    s.start();
  } catch { }
}

export function loop(name, on) {
  if (!on) {
    try { loopNode?.stop(); } catch { }
    loopNode = null; loopName = null;
    return;
  }
  if (loopName === name && loopNode) return;
  loopName = name;
  startLoopNode();
}

function startLoopNode() {
  if (!loopName || !allowed(loopName)) return;
  try { loopNode?.stop(); } catch { }
  const g = ctx.createGain();
  g.gain.value = 0.22; // ambient, low volume
  g.connect(master);
  const s = ctx.createBufferSource();
  s.buffer = buffers[loopName];
  s.loop = true;
  s.connect(g);
  s.start();
  loopNode = s;
}
