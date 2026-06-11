// Boot + router: every render is a pure function of the room snapshot.
import { signIn, get, roomRef } from './firebase.js';
import { state, initState, attachRoom, detachRoom, armPresence, serverNow } from './state.js';
import * as audio from './audio.js';
import { $, el, toast } from './util.js';
import { home } from './screens/home.js';
import { lobby } from './screens/lobby.js';
import { reveal } from './screens/reveal.js';

const screens = { home, lobby, reveal };
const phaseToScreen = {
  lobby: 'lobby', reveal: 'reveal', night: 'night', morning: 'report',
  day: 'day', vote: 'vote', execution: 'report', result: 'result',
};
const DAY_PHASES = new Set(['morning', 'day', 'vote', 'execution']);

let cur = { key: null, api: null };
let lastEffectKey = null; // phase#round#voteKey — for one-shot sounds
let hostEngine = null;
let hostIv = null;

function ctxNow() {
  const room = state.room;
  const me = room.players?.[state.uid] || null;
  return {
    uid: state.uid, code: state.code, room, me,
    isHost: room.meta?.hostUid === state.uid,
    alive: me ? me.alive !== false : false,
    mode: room.meta?.mode || 'majlis',
    myRole: state.secret?.role || null,
    state, serverNow,
  };
}

const loading = { key: 'loading', mount(root) { root.append(el('div', 'boot', '🌙 جارٍ فتح الديرة…')); }, update() { } };
const wip = { key: 'wip', mount(root, ctx) { root.append(el('div', 'boot', `🚧 شاشة «${ctx.room.phase}» قيد البناء`)); }, update() { } };

function pickScreen(ctx) {
  if (!ctx.code) return 'home';
  const { meta, phase, players } = ctx.room;
  if (meta === undefined || phase === undefined) return 'loading';
  if (meta === null) { // room vanished
    localStorage.removeItem('wolf_code');
    detachRoom();
    return 'home';
  }
  // evicted / not a member of a started game
  if (players !== undefined && !ctx.me && phase !== 'lobby') {
    localStorage.removeItem('wolf_code');
    detachRoom();
    toast('انت برا هاللعبة 😅');
    return 'home';
  }
  if (players !== undefined && !ctx.me && phase === 'lobby') {
    // was kicked from lobby (or never joined): back to home to rejoin
    localStorage.removeItem('wolf_code');
    detachRoom();
    return 'home';
  }
  return phaseToScreen[phase] || 'lobby';
}

export function render() {
  const ctx = ctxNow();
  const key = pickScreen(ctx);

  audio.setRouting(ctx.mode, ctx.isHost);
  applyTheme(ctx);
  if (ctx.me) armPresence();

  const root = $('#screen');
  const api = screens[key] || (key === 'loading' ? loading : key === 'home' ? home : wip);
  if (cur.key !== key) {
    cur.api?.unmount?.();
    root.innerHTML = '';
    cur = { key, api };
    api.mount(root, ctx);
  } else {
    api.update?.(ctx);
  }

  hud(ctx, key);
  effects(ctx);
  hostLoop(ctx);
}

function applyTheme(ctx) {
  let theme = 'night';
  if (ctx.code && ctx.room.meta) {
    if (ctx.room.phase === 'result') theme = ctx.room.result?.winner === 'village' ? 'day' : 'night';
    else if (DAY_PHASES.has(ctx.room.phase)) theme = 'day';
  }
  document.body.dataset.theme = theme;
}

function hud(ctx, key) {
  const badge = $('#roomBadge');
  const inGame = ctx.code && ctx.room.meta && !['home', 'loading'].includes(key);
  badge.hidden = !inGame || key === 'lobby';
  if (inGame) badge.textContent = `ديرة ${ctx.code} · جولة ${ctx.room.round || '–'}`;

  const hostGone = ctx.code && ctx.room.meta && ctx.room.phase !== 'lobby' && ctx.room.phase !== 'result'
    && ctx.room.players?.[ctx.room.meta.hostUid]?.connected === false;
  $('#hostBanner').hidden = !hostGone;

  const spectating = !!(ctx.me && !ctx.alive && !['lobby', 'result'].includes(ctx.room.phase));
  $('#specOverlay').hidden = !spectating;
}

// one-shot per phase change: sounds + ambient loop (SPEC §8)
function effects(ctx) {
  const phase = ctx.room.phase;
  if (!ctx.code || !phase) { audio.loop('night-wind', false); lastEffectKey = null; return; }
  const key = `${phase}#${ctx.room.round || 0}#${ctx.room.phaseInfo?.voteKey || ''}`;
  if (lastEffectKey === null) { lastEffectKey = key; return; } // first paint: no sounds
  if (key === lastEffectKey) return;
  lastEffectKey = key;

  audio.loop('night-wind', phase === 'night');
  if (phase === 'night') audio.play('wolf-howl');
  if (phase === 'morning') {
    audio.play('rooster');
    if (ctx.room.report?.reason === 'saved') audio.play('save');
  }
  if (phase === 'vote') audio.play('drum');
  if (phase === 'execution' && ctx.room.report?.victimUid) audio.play('sword');
  if (phase === 'result') audio.play(ctx.room.result?.winner === 'village' ? 'win-village' : 'win-wolves');
}

// host authority loop: phase timers + resolutions (host-engine.js lands in M3+)
function hostLoop(ctx) {
  const active = ctx.isHost && ctx.code && ctx.room.phase && ctx.room.phase !== 'lobby';
  if (active && !hostEngine) {
    import('./host-engine.js').then(m => { hostEngine = m; }).catch(() => { });
  }
  if (active && hostEngine) hostEngine.tick(ctxNow());
  if (active && !hostIv) hostIv = setInterval(() => { if (hostEngine) hostEngine.tick(ctxNow()); }, 1000);
  if (!active && hostIv) { clearInterval(hostIv); hostIv = null; }
}

// mute button
$('#muteBtn').textContent = audio.isMuted() ? '🔇' : '🔊';
$('#muteBtn').onclick = () => {
  audio.unlock();
  $('#muteBtn').textContent = audio.toggleMute() ? '🔇' : '🔊';
};

window.__wolf = state; // debug hook (console inspection)

(async function boot() {
  try {
    const user = await signIn();
    initState(user.uid);
    state.onChange = render;
    const saved = localStorage.getItem('wolf_code');
    if (saved && /^\d{4}$/.test(saved)) {
      try {
        const meta = await get(roomRef(saved, 'meta'));
        if (meta.exists()) attachRoom(saved);
        else localStorage.removeItem('wolf_code');
      } catch { localStorage.removeItem('wolf_code'); }
    }
    render();
  } catch (e) {
    console.error(e);
    $('#screen').innerHTML = '';
    $('#screen').append(el('div', 'boot-error',
      `تعذّر الاتصال 😵<br><small>${e?.code || e?.message || e}</small><small>تأكد أن Anonymous Auth مفعّل في مشروع Firebase</small>`));
  }
})();
