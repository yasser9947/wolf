// Realtime room state: every screen renders purely from this snapshot.
import { db, ref, onValue, set, onDisconnect } from './firebase.js';

export const state = {
  uid: null, code: null, offset: 0,
  room: {},            // meta, phase, round, phaseInfo, players, report, result, chat, votes
  secret: null,        // my secrets/{uid}
  secretsAll: null,    // host only: all roles (needed for night resolution)
  nightActions: null,  // host only: nightActions/{round}
  nightActionsRound: null, // which round the snapshot above belongs to
  myNightAction: null, // my own nightActions/{round}/{uid}
  myNightActionRound: null,
  votesKeyLoaded: null, // which voteKey room.votes belongs to
  wolfChannel: null,   // wolves only
  presenceArmed: false,
  lastError: null,
  onChange: null,
};

export const serverNow = () => Date.now() + (state.offset || 0);

let subs = [];
const dyn = {};
let queued = false;

function emit() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; state.onChange?.(); });
}

export function initState(uid) {
  state.uid = uid;
  onValue(ref(db, '.info/serverTimeOffset'), s => { state.offset = s.val() || 0; });
}

function subscribe(path, assign) {
  const off = onValue(ref(db, path),
    snap => { assign(snap.val()); syncDynamic(); emit(); },
    err => { state.lastError = err.message; console.warn('sub:', path, err.message); emit(); });
  subs.push(off);
}

export function attachRoom(code) {
  detachRoom();
  state.code = code;
  state.room = {};
  const base = `rooms/${code}`;
  subscribe(`${base}/meta`,      v => state.room.meta = v);
  subscribe(`${base}/phase`,     v => state.room.phase = v);
  subscribe(`${base}/round`,     v => state.room.round = v);
  subscribe(`${base}/phaseInfo`, v => state.room.phaseInfo = v);
  subscribe(`${base}/players`,   v => state.room.players = v);
  subscribe(`${base}/report`,    v => state.room.report = v);
  subscribe(`${base}/result`,    v => state.room.result = v);
  subscribe(`${base}/chat`,      v => state.room.chat = v);
  subscribe(`${base}/secrets/${state.uid}`, v => state.secret = v);
  emit();
}

export function detachRoom() {
  subs.forEach(off => off());
  subs = [];
  for (const k of Object.keys(dyn)) { dyn[k].off?.(); delete dyn[k]; }
  state.code = null; state.room = {}; state.secret = null;
  state.secretsAll = null; state.nightActions = null; state.nightActionsRound = null;
  state.myNightAction = null; state.myNightActionRound = null;
  state.votesKeyLoaded = null; state.wolfChannel = null;
  state.presenceArmed = false;
  emit();
}

function ensure(slot, version, path, assign) {
  if (dyn[slot]?.version === version) return;
  dyn[slot]?.off?.();
  dyn[slot] = {
    version,
    off: onValue(ref(db, path),
      s => { assign(s.val()); emit(); },
      e => { state.lastError = e.message; console.warn('dyn:', path, e.message); }),
  };
}

// round/role/voteKey-dependent subscriptions
function syncDynamic() {
  const { code, uid, room } = state;
  if (!code) return;
  const base = `rooms/${code}`;
  const round = room.round || 0;
  const isHost = room.meta?.hostUid === uid;
  const pi = room.phaseInfo;
  const voteKey = (pi?.phase === 'vote' && pi.voteKey) ? pi.voteKey : String(round);
  // version-stamp every dynamic snapshot: consumers must match the stamp against
  // the CURRENT round/voteKey, otherwise a stale snapshot from the previous round
  // can resolve a fresh night/vote instantly (the "auto-death" bug)
  ensure('votes', voteKey, `${base}/votes/${voteKey}`, v => { state.room.votes = v; state.votesKeyLoaded = voteKey; });
  ensure('myact', round, `${base}/nightActions/${round}/${uid}`, v => { state.myNightAction = v; state.myNightActionRound = round; });
  if (isHost) {
    ensure('nacts', round, `${base}/nightActions/${round}`, v => { state.nightActions = v; state.nightActionsRound = round; });
    ensure('secretsAll', 1, `${base}/secrets`, v => state.secretsAll = v);
  }
  if (state.secret?.role === 'wolf') {
    ensure('wolfch', 1, `${base}/wolfChannel`, v => state.wolfChannel = v);
  }
}

// presence: connected flag + onDisconnect (SPEC §4 host-disconnect banner)
export function armPresence() {
  if (state.presenceArmed || !state.code || !state.uid) return;
  state.presenceArmed = true;
  const cref = ref(db, `rooms/${state.code}/players/${state.uid}/connected`);
  const off = onValue(ref(db, '.info/connected'), s => {
    if (s.val()) {
      onDisconnect(cref).set(false).then(() => set(cref, true)).catch(() => {});
    }
  });
  subs.push(off);
}
