// Host authority (SPEC §1/§5): the host client is the only writer of phase, round,
// secrets, wolfChannel, report, result and alive flags. Everything here is driven
// by tick() — called on every snapshot change + a 1s interval — and is safe to
// re-run after a host refresh (state is recomputed from RTDB, never from memory).
import { update, push, roomRef, ref, db, increment } from './firebase.js';
import { serverNow } from './state.js';
import { shuffle, rnd, durMs } from './util.js';

// global play counters (RTDB /stats) — host-incremented, readable by all, for verification
const bumpStat = key => update(ref(db, 'stats'), { [key]: increment(1) }).catch(() => {});

let busy = false;

const wolvesFor = n => (n >= 10 ? 3 : n >= 7 ? 2 : 1);
const aliveUids = players => Object.keys(players || {}).filter(u => players[u].alive !== false);

function pushLog(code, updates, text) {
  const key = push(roomRef(code, 'publicLog')).key;
  updates[`publicLog/${key}`] = text;
}

function newPhaseInfo(phase, round, meta, extra = {}) {
  return { phase, round, endsAt: serverNow() + durMs(phase, meta), ...extra };
}

// ---------- start (from lobby) ----------
export async function startGame(ctx) {
  const { code, room } = ctx;
  const players = room.players || {};
  const uids = Object.keys(players);
  if (uids.length < 5) throw new Error('تحتاجون ٥ على الأقل');
  if (uids.length > 14) throw new Error('الحد ١٤');

  const deck = shuffle(uids);
  const nWolves = wolvesFor(uids.length);
  const members = {};
  const updates = {
    round: 1,
    phase: 'reveal',
    phaseInfo: newPhaseInfo('reveal', 1, room.meta),
    report: null, result: null, votes: null, nightActions: null, chat: null,
  };
  deck.forEach((uid, i) => {
    const role = i < nWolves ? 'wolf' : i === nWolves ? 'seer' : i === nWolves + 1 ? 'doctor' : 'villager';
    updates[`secrets/${uid}`] = { role };
    updates[`players/${uid}/alive`] = true;
    updates[`players/${uid}/misses`] = 0;
    if (role === 'wolf') members[uid] = players[uid].name;
  });
  updates.wolfChannel = { members }; // picks reset implicitly
  pushLog(code, updates, `بدأت اللعبة — ${uids.length} من أهل الديرة، فيهم ${nWolves} ${nWolves === 1 ? 'ذيب' : 'ذيابة'} 🐺`);
  await update(roomRef(code), updates);
  bumpStat('gamesStarted'); // global counter — every fresh deal (incl. after replay) counts
}

// ---------- replay (from result) ----------
export async function replay(ctx) {
  const updates = {
    phase: 'lobby', round: 0, phaseInfo: null, report: null, result: null,
    secrets: null, wolfChannel: null, nightActions: null, votes: null,
    chat: null, publicLog: null,
  };
  for (const uid of Object.keys(ctx.room.players || {})) {
    updates[`players/${uid}/alive`] = true;
    updates[`players/${uid}/misses`] = 0;
  }
  await update(roomRef(ctx.code), updates);
}

// ---------- the authority loop ----------
export function tick(ctx) {
  if (busy || !ctx.isHost || !ctx.code) return;
  const { room } = ctx;
  const phase = room.phase;
  if (!phase || phase === 'lobby' || phase === 'result') return;
  if (room.players === undefined || room.meta === undefined) return; // snapshots not in yet

  const pi = room.phaseInfo;
  const stale = !pi || pi.phase !== phase || (pi.round || 0) !== (room.round || 0);
  if (stale) {
    // host crashed/refreshed mid-transition: re-stamp a fresh window for this phase
    const extra = phase === 'vote' ? { voteKey: String(room.round || 1) } : {};
    return fireAndForget(update(roomRef(ctx.code, 'phaseInfo'), newPhaseInfo(phase, room.round || 1, room.meta, extra)));
  }

  if (phase === 'night') {
    seerLiveAnswer(ctx);
    if (allNightActionsIn(ctx)) return advance(ctx);
  }
  if (phase === 'vote' && allVotesIn(ctx)) return advance(ctx);

  // timer expiry — but never resolve night/vote off a stale (previous-round) snapshot
  if (serverNow() >= (pi.endsAt || 0)) {
    if (phase === 'night' && !actsOf(ctx)) return; // wait for this round's actions to load
    if (phase === 'vote' && !votesOf(ctx)) return;  // wait for this voteKey to load
    return advance(ctx);
  }
}

function fireAndForget(p) { p.catch(e => console.warn('host write:', e?.message)); }

// Host taps "skip" — force-advance the current timed phase now (same stale-guards
// as the timer path, so a half-loaded round can never be resolved early).
export function skip(ctx) {
  if (busy || !ctx.isHost) return;
  const phase = ctx.room?.phase;
  if (!phase || phase === 'lobby' || phase === 'result') return;
  if (phase === 'night' && !actsOf(ctx)) return;
  if (phase === 'vote' && !votesOf(ctx)) return;
  return advance(ctx);
}

async function advance(ctx) {
  busy = true;
  try {
    switch (ctx.room.phase) {
      case 'reveal':    await toNight(ctx, 1); break;
      case 'night':     await resolveNight(ctx); break;
      case 'morning':   await afterReport(ctx); break;
      case 'day':       await toVote(ctx); break;
      case 'vote':      await resolveVote(ctx); break;
      case 'execution': await afterReport(ctx); break;
    }
  } catch (e) {
    console.error('advance failed:', e);
  } finally {
    busy = false;
  }
}

// ---------- helpers over host-only snapshots ----------
const rolesOf = ctx => ctx.state.secretsAll || null;

// Night actions, but ONLY if the loaded snapshot belongs to the CURRENT round.
// Returns null while a stale (previous-round) snapshot is still in memory — this
// is the guard against the "auto-death on round 2" bug: without it, round-1
// actions would resolve round-2's night the instant we entered it.
function actsOf(ctx) {
  // string-safe compare (round is a number but stay symmetric with votesOf's String keys)
  if (String(ctx.state.nightActionsRound) !== String(ctx.room.round)) return null; // stale → not loaded yet
  return ctx.state.nightActions || {};
}

// Votes, gated to the current voteKey (handles the N → "Nr" revote switch too).
function votesOf(ctx) {
  const pi = ctx.room.phaseInfo || {};
  const wantKey = (pi.phase === 'vote' && pi.voteKey) ? pi.voteKey : String(ctx.room.round);
  if (ctx.state.votesKeyLoaded !== wantKey) return null; // stale → not loaded yet
  return ctx.room.votes || {};
}

function expectedNightActors(ctx) {
  const roles = rolesOf(ctx);
  const players = ctx.room.players || {};
  if (!roles) return null;
  return aliveUids(players).filter(u => ['wolf', 'seer', 'doctor'].includes(roles[u]?.role));
}

function allNightActionsIn(ctx) {
  const expected = expectedNightActors(ctx);
  if (!expected || !expected.length) return false;
  const acts = actsOf(ctx);
  if (!acts) return false; // snapshot for this round not loaded yet — wait
  return expected.every(u => acts[u]?.target);
}

function allVotesIn(ctx) {
  const votes = votesOf(ctx);
  if (!votes) return false; // snapshot for this voteKey not loaded yet — wait
  const players = ctx.room.players || {};
  const voters = aliveUids(players);
  return voters.length > 0 && voters.every(u => votes[u]);
}

function seerLiveAnswer(ctx) {
  const roles = rolesOf(ctx);
  if (!roles) return;
  const players = ctx.room.players || {};
  const round = ctx.room.round;
  const seer = aliveUids(players).find(u => roles[u]?.role === 'seer');
  if (!seer) return;
  const acts = actsOf(ctx);
  if (!acts) return; // stale/unloaded — never answer from a previous round's check
  const act = acts[seer];
  if (!act || act.type !== 'check' || !act.target) return;
  if (roles[seer]?.seerResults?.[round]) return; // already answered
  const verdict = roles[act.target]?.role === 'wolf' ? 'wolf' : 'notwolf';
  fireAndForget(update(roomRef(ctx.code, `secrets/${seer}/seerResults`), { [round]: verdict }));
}

function winnerOf(players, roles) {
  const alive = aliveUids(players);
  const wolves = alive.filter(u => roles[u]?.role === 'wolf').length;
  if (wolves === 0) return 'village';
  if (wolves >= alive.length - wolves) return 'wolves';
  return null;
}

// ---------- night → morning ----------
async function resolveNight(ctx) {
  const roles = rolesOf(ctx);
  if (!roles) return; // secrets snapshot not in yet — next tick
  const acts = actsOf(ctx);
  if (!acts) return;  // previous-round snapshot still loaded — never resolve off stale data
  const { code, room } = ctx;
  const players = room.players || {};
  const round = room.round;
  const alive = aliveUids(players);
  const isAlive = u => players[u]?.alive !== false;

  // wolf kill: one entry per wolf pick → weighted random among submitted targets.
  // With the shared hit-list, both wolves auto-submit the same top target, so this
  // resolves to the agreed victim. If NO wolf submitted (empty list / all asleep),
  // a random alive non-wolf is taken — so the wolves never need to touch the phone.
  const fodder = alive.filter(u => roles[u]?.role !== 'wolf');
  const pool = [];
  for (const u of alive.filter(u => roles[u]?.role === 'wolf')) {
    const a = acts[u];
    if (a?.type === 'kill' && a.target && isAlive(a.target) && roles[a.target]?.role !== 'wolf') pool.push(a.target);
  }
  const target = pool.length ? pool[rnd(pool.length)]
    : (fodder.length ? fodder[rnd(fodder.length)] : null); // silence → random kill

  const doctor = alive.find(u => roles[u]?.role === 'doctor');
  const dAct = doctor ? acts[doctor] : null;
  const saveTarget = (dAct?.type === 'save' && dAct.target && isAlive(dAct.target)) ? dAct.target : null;

  const saved = !!(target && saveTarget === target);
  const victim = saved ? null : target;
  const reason = victim ? 'killed' : (saved ? 'saved' : 'quiet');

  // seer answer (in case it didn't land live)
  const seer = alive.find(u => roles[u]?.role === 'seer');
  const sAct = seer ? acts[seer] : null;

  const updates = {
    phase: 'morning',
    phaseInfo: newPhaseInfo('morning', round, room.meta),
    report: {
      kind: 'morning', round, reason,
      victimUid: victim || null,
      victimName: victim ? players[victim].name : null,
      victimAvatar: victim ? (players[victim].avatarIdx || 0) : 0,
      victimRole: victim ? roles[victim].role : null,
    },
  };
  if (victim) updates[`players/${victim}/alive`] = false;
  if (seer && sAct?.type === 'check' && sAct.target && !roles[seer]?.seerResults?.[round]) {
    updates[`secrets/${seer}/seerResults/${round}`] = roles[sAct.target]?.role === 'wolf' ? 'wolf' : 'notwolf';
  }

  // AFK bookkeeping (online mode): role actors who slept through the night (SPEC §4)
  if (room.meta?.mode === 'online') {
    for (const u of expectedNightActors(ctx) || []) {
      updates[`players/${u}/misses`] = acts[u]?.target ? 0 : (players[u].misses || 0) + 1;
    }
  }

  pushLog(code, updates, victim
    ? `صباح أليم… فقدنا ${players[victim].name} 💔`
    : (saved ? 'الحكيم أنقذ الديرة، ما مات أحد 🌿' : 'ليلة هادية… ما مات أحد 🌙'));
  await update(roomRef(code), updates);
}

// ---------- morning/execution → (result | next) ----------
async function afterReport(ctx) {
  const roles = rolesOf(ctx);
  if (!roles) return;
  const { code, room } = ctx;
  const players = room.players || {};
  const winner = winnerOf(players, roles);
  if (winner) return finishGame(ctx, winner);
  if (room.phase === 'morning') {
    await update(roomRef(code), {
      phase: 'day',
      phaseInfo: newPhaseInfo('day', room.round, room.meta),
    });
  } else {
    await toNight(ctx, (room.round || 1) + 1);
  }
}

async function toNight(ctx, round) {
  await update(roomRef(ctx.code), {
    round,
    phase: 'night',
    phaseInfo: newPhaseInfo('night', round, ctx.room.meta),
    // NB: do NOT clear wolfChannel/hitlist — the wolves' ordered plan persists
    // across nights; each wolf's client re-submits the top target automatically.
  });
}

async function toVote(ctx) {
  const round = ctx.room.round;
  await update(roomRef(ctx.code), {
    phase: 'vote',
    phaseInfo: newPhaseInfo('vote', round, ctx.room.meta, { voteKey: String(round) }),
  });
}

// ---------- vote → execution (with one revote on tie, SPEC §4.6) ----------
async function resolveVote(ctx) {
  const roles = rolesOf(ctx);
  if (!roles) return;
  const votes = votesOf(ctx);
  if (!votes) return; // previous voteKey snapshot still loaded — wait for this one
  const { code, room } = ctx;
  const players = room.players || {};
  const round = room.round;
  const pi = room.phaseInfo || {};
  const voters = aliveUids(players);
  const candidates = Array.isArray(pi.candidates) ? pi.candidates : null;

  const counts = {};
  for (const v of voters) {
    const t = votes[v];
    if (!t || t === 'abstain') continue;
    if (players[t]?.alive === false) continue;
    if (candidates && !candidates.includes(t)) continue;
    counts[t] = (counts[t] || 0) + 1;
  }

  const updates = {};
  // AFK bookkeeping (online): silent voters
  if (room.meta?.mode === 'online') {
    for (const u of voters) updates[`players/${u}/misses`] = votes[u] ? 0 : (players[u].misses || 0) + 1;
  }

  const top = Math.max(0, ...Object.values(counts));
  const tied = Object.keys(counts).filter(t => counts[t] === top);
  const isRevote = String(pi.voteKey || '').endsWith('r');

  if (top > 0 && tied.length === 1) {
    // execution
    const victim = tied[0];
    updates.phase = 'execution';
    updates.phaseInfo = newPhaseInfo('execution', round, room.meta);
    updates.report = {
      kind: 'execution', round, tie: false,
      victimUid: victim, victimName: players[victim].name,
      victimAvatar: players[victim].avatarIdx || 0,
      victimRole: roles[victim].role,
    };
    updates[`players/${victim}/alive`] = false;
    pushLog(code, updates, `الديرة صوّتت… ${players[victim].name} انطرد، وطلع ${roles[victim].role === 'wolf' ? 'ذيب 🐺' : 'مو ذيب'}`);
  } else if (top > 0 && tied.length > 1 && !isRevote) {
    // one revote between tied players only
    updates.phaseInfo = newPhaseInfo('vote', round, room.meta, { voteKey: `${round}r`, candidates: tied, revote: true });
    pushLog(code, updates, 'تعادل! إعادة تصويت بين المتعادلين 🔁');
  } else {
    // still tied (or nobody voted) → no execution
    updates.phase = 'execution';
    updates.phaseInfo = newPhaseInfo('execution', round, room.meta);
    updates.report = { kind: 'execution', round, tie: true, victimUid: null, victimName: null, victimRole: null };
    pushLog(code, updates, 'اختلفت الديرة وما طاح أحد 🤝');
  }
  await update(roomRef(code), updates);
}

async function finishGame(ctx, winner) {
  const roles = rolesOf(ctx);
  const { code, room } = ctx;
  const players = room.players || {};
  const reveal = {};
  for (const uid of Object.keys(players)) {
    reveal[uid] = {
      name: players[uid].name,
      avatarIdx: players[uid].avatarIdx || 0,
      role: roles[uid]?.role || 'villager',
      alive: players[uid].alive !== false,
    };
  }
  const updates = {
    phase: 'result',
    phaseInfo: null,
    result: { winner, reveal },
  };
  pushLog(code, updates, winner === 'village' ? 'فازت الديرة 🌴' : 'فازت الذيابة 🐺');
  await update(roomRef(code), updates);
  bumpStat('gamesCompleted'); // global counter — a game that reached a winner
}
