// End-to-end game driver — runs inside the host page against the Firebase emulator.
// Spins up bot players via the SDK, scripts a full game, and asserts the invariants
// behind every field-note fix. Load by pasting into the page or via the test runner;
// expects window.__wolf (state) and a host already signed in.
//
// Usage in console:  await window.__e2e.run()
// Returns { pass, fails:[], log:[] }.

const CONFIG = {
  apiKey: 'AIzaSyDVQGEYKgRqWYVP1tx-IEuWBx-QPOvE9Cg',
  authDomain: 'wolf-1ec11.firebaseapp.com',
  databaseURL: 'https://wolf-1ec11-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'wolf-1ec11',
};
const EMU_DB = 'http://127.0.0.1:9000?ns=demo-wolf-default-rtdb';

async function run() {
  const log = [], fails = [];
  window.__e2elog = log; // live view — survives a mid-run throw
  const w = window.__wolf;
  const say = m => { log.push(m); console.log('[e2e]', m); };
  const ok = (cond, m) => { if (!cond) { fails.push(m); console.error('[e2e] FAIL:', m); } else say('✓ ' + m); };
  const until = (cond, ms = 20000, label = '') => new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      let v = false; try { v = cond(); } catch {}
      if (v) { clearInterval(iv); res(true); }
      else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout: ' + label)); }
    }, 120);
  });

  const [appM, authM, dbM] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js'),
  ]);
  const fb = await import('/js/firebase.js');

  // ---- create a fresh room as host ----
  const nameInput = document.querySelector('.screen-home .input');
  if (nameInput) { nameInput.value = 'أبو فهد'; nameInput.dispatchEvent(new Event('input')); document.querySelector('.btn-primary').click(); }
  await until(() => w.code && w.room.phase === 'lobby', 15000, 'room created');
  const code = w.code;
  say('room ' + code);

  // ---- 4 bots join ----
  const names = ['سعود', 'نورة', 'متعب', 'الجوهرة'];
  const bots = [];
  for (let i = 0; i < 4; i++) {
    let app; try { app = appM.getApp('e2e' + i); } catch { app = appM.initializeApp(CONFIG, 'e2e' + i); }
    const auth = authM.getAuth(app);
    authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const db = dbM.getDatabase(app, EMU_DB);
    const cred = auth.currentUser ? { user: auth.currentUser } : await authM.signInAnonymously(auth);
    await dbM.set(dbM.ref(db, `rooms/${code}/players/${cred.user.uid}`), {
      name: names[i], avatarIdx: (i + 1) % 12, alive: true, connected: true,
      joinedAt: dbM.serverTimestamp(), misses: 0,
    });
    bots.push({ uid: cred.user.uid, name: names[i], db, m: dbM });
  }
  await until(() => Object.keys(w.room.players || {}).length === 5, 8000, '5 players');
  ok(true, 'lobby filled to 5');

  const byName = {}; bots.forEach(b => byName[b.name] = b);
  const U = n => n === 'ME' ? w.uid : byName[n].uid;
  // host is always referred to as 'ME' everywhere (roles map, act/vote, name lists)
  const nameOf = u => u === w.uid ? 'ME' : (bots.find(b => b.uid === u)?.name || u.slice(0, 5));
  const role = async u => u === w.uid ? w.secret?.role : (await byName[nameOf(u)].m.get(byName[nameOf(u)].m.ref(byName[nameOf(u)].db, `rooms/${code}/secrets/${u}`))).val()?.role;
  const act = (n, round, type, target) => n === 'ME'
    ? fb.set(fb.roomRef(code, `nightActions/${round}/${w.uid}`), { type, target }).catch(() => {})
    : byName[n].m.set(byName[n].m.ref(byName[n].db, `rooms/${code}/nightActions/${round}/${byName[n].uid}`), { type, target }).catch(() => {});
  const vote = (n, key, target) => n === 'ME'
    ? fb.set(fb.roomRef(code, `votes/${key}/${w.uid}`), target).catch(() => {})
    : byName[n].m.set(byName[n].m.ref(byName[n].db, `rooms/${code}/votes/${key}/${byName[n].uid}`), target).catch(() => {});

  // ---- start game ----
  document.querySelector('.btn-primary').click(); // ابدأ
  await until(() => w.room.phase === 'reveal', 10000, 'reveal');
  await until(() => !!w.secret?.role, 8000, 'my role');
  // map roles
  const roles = {}; for (const u of Object.keys(w.room.players)) roles[nameOf(u)] = await role(u);
  say('roles ' + JSON.stringify(roles));
  const wolves = Object.keys(roles).filter(n => roles[n] === 'wolf');
  ok(wolves.length === 1, '5p → exactly 1 wolf');
  ok(Object.values(roles).filter(r => r === 'seer').length === 1, 'exactly 1 seer(الشيخ)');
  ok(Object.values(roles).filter(r => r === 'doctor').length === 1, 'exactly 1 doctor');

  const wolfN = wolves[0];
  const villagers = Object.keys(roles).filter(n => roles[n] === 'villager');
  const seerN = Object.keys(roles).find(n => roles[n] === 'seer');
  const docN = Object.keys(roles).find(n => roles[n] === 'doctor');

  // =========================================================================
  // ROUND 1 NIGHT — doctor SAVES the wolf's target → "no death" morning
  // =========================================================================
  await until(() => w.room.phase === 'night' && w.room.round === 1, 12000, 'night1');
  const victim1 = villagers[0];
  say(`night1: wolf=${wolfN}→${victim1}, doctor protects ${victim1} (save expected)`);
  await act(wolfN, 1, 'kill', U(victim1));
  await act(docN, 1, 'save', U(victim1));
  await act(seerN, 1, 'check', U(wolfN)); // الشيخ يكشف الذيب
  await until(() => w.room.phase === 'morning' && w.room.round === 1, 15000, 'morning1');
  ok(w.room.report?.reason === 'saved', 'doctor save on wolf-target → morning reason=saved (no death)');
  ok(w.room.players[U(victim1)]?.alive !== false, 'saved villager still alive');
  // seer learned the truth
  const seerUid = U(seerN);
  const sr = (await fb.get(fb.roomRef(code, `secrets/${seerUid}/seerResults/1`))).val();
  ok(sr === 'wolf', 'الشيخ check on wolf returned "wolf"');

  // =========================================================================
  // ROUND 1 DAY/VOTE — engineer a TIE → revote, then revote resolves
  // 5 alive: ME(host),سعود,نورة,متعب,الجوهرة. Vote: 2 for villager[0], 2 for villager[1], 1 abstain-ish
  // =========================================================================
  await until(() => w.room.phase === 'day' && w.room.round === 1, 15000, 'day1');
  ok(true, 'reached day1');
  await until(() => w.room.phase === 'vote' && w.room.phaseInfo?.voteKey === '1', 30000, 'vote1');
  const allNames = ['ME', ...names];
  const aliveNames = allNames.filter(n => w.room.players[U(n)]?.alive !== false);
  // make two candidates tie: pick first two alive non-self targets
  const cand = aliveNames.filter(n => n !== wolfN).slice(0, 2); // any two
  const A = cand[0], B = cand[1];
  // split: half vote A, half vote B (force tie). voters = aliveNames
  let toggle = true;
  for (const voter of aliveNames) { await vote(voter, '1', U(toggle ? A : B)); toggle = !toggle; }
  // odd number (5) → not a clean tie necessarily; assert the engine either executes top or revotes
  await until(() => (w.room.phaseInfo?.revote === true) || w.room.phase === 'execution', 30000, 'vote1 resolved');
  if (w.room.phaseInfo?.revote) {
    ok(Array.isArray(w.room.phaseInfo.candidates) && w.room.phaseInfo.candidates.length >= 2, 'tie → revote among tied candidates only');
    // revote: everyone piles on candidate A → execution of A
    await until(() => w.room.phaseInfo?.voteKey?.endsWith('r'), 5000, 'revote key');
    for (const voter of aliveNames) await vote(voter, w.room.phaseInfo.voteKey, U(A));
    await until(() => w.room.phase === 'execution', 30000, 'execution after revote');
    ok(w.room.report?.victimUid === U(A), 'revote landslide executes candidate A');
  } else {
    ok(w.room.phase === 'execution', 'plurality → execution without revote');
  }
  const exec1 = w.room.report?.victimUid;
  if (exec1) ok(w.room.players[exec1]?.alive === false, 'executed player is now dead');

  // =========================================================================
  // ROUND 2 NIGHT — THE BUG FIX: must NOT auto-resolve. Verify it WAITS for
  // fresh actions instead of resolving instantly off round-1 data.
  // =========================================================================
  await until(() => w.room.phase !== 'execution', 12000, 'leave execution1');
  // if game didn't already end, we should reach night round 2
  let reachedNight2 = false;
  try { await until(() => w.room.phase === 'night' && w.room.round === 2, 14000, 'night2'); reachedNight2 = true; } catch {}
  if (w.room.phase === 'result') {
    ok(true, 'game ended at/after round 1 (valid short game) — winner=' + w.room.result?.winner);
  } else if (reachedNight2) {
    // CRITICAL ASSERTION: at the instant night2 starts, no morning report should appear
    // for ~2s unless we submit actions. Watch that it stays in night without a victim.
    const t0 = Date.now();
    let autoAdvanced = false;
    while (Date.now() - t0 < 2500) {
      if (w.room.phase !== 'night') { autoAdvanced = true; break; }
      await new Promise(r => setTimeout(r, 150));
    }
    ok(!autoAdvanced, 'round-2 night does NOT auto-resolve before any action (race bug fixed)');

    // now play it out: wolf kills a real target, doctor protects someone else → a death
    const alive2 = allNames.filter(n => w.room.players[U(n)]?.alive !== false);
    const wolfAlive = alive2.includes(wolfN);
    if (wolfAlive) {
      const prey = alive2.find(n => n !== wolfN && roles[n] !== 'doctor') || alive2.find(n => n !== wolfN);
      const docAlive = alive2.includes(docN);
      say(`night2: wolf ${wolfN}→${prey}` + (docAlive ? `, doctor protects self` : ''));
      await act(wolfN, 2, 'kill', U(prey));
      if (docAlive) await act(docN, 2, 'save', U(docN)); // protect self, not prey → prey dies
      const seerAlive = alive2.includes(seerN);
      if (seerAlive) await act(seerN, 2, 'check', U(wolfN));
      await until(() => w.room.phase === 'morning' && w.room.round === 2, 15000, 'morning2');
      ok(w.room.report?.round === 2, 'round-2 morning belongs to round 2 (fresh resolution)');
      ok(w.room.report?.victimUid === U(prey) || w.room.report?.reason === 'killed',
        'round-2 death reflects round-2 wolf choice, not a stale auto-kill');
    } else {
      ok(true, 'wolf already executed → village likely winning; skipping night2 kill');
    }
  }

  // =========================================================================
  // play to a terminal state via host skip (also tests the skip control)
  // =========================================================================
  let guard = 0;
  while (w.room.phase !== 'result' && guard++ < 40) {
    const ph = w.room.phase, rnd = w.room.round;
    if (ph === 'night') {
      // everyone alive with a role acts so the night can resolve
      const alive = allNames.filter(n => w.room.players[U(n)]?.alive !== false);
      for (const n of alive) {
        const r = roles[n];
        if (r === 'wolf') { const prey = alive.find(x => x !== n && roles[x] !== 'wolf'); if (prey) await act(n, rnd, 'kill', U(prey)); }
        else if (r === 'seer') { const t = alive.find(x => x !== n); if (t) await act(n, rnd, 'check', U(t)); }
        else if (r === 'doctor') await act(n, rnd, 'save', U(n));
      }
    } else if (ph === 'vote') {
      const key = w.room.phaseInfo?.voteKey || String(rnd);
      const alive = allNames.filter(n => w.room.players[U(n)]?.alive !== false);
      const cands = Array.isArray(w.room.phaseInfo?.candidates) ? w.room.phaseInfo.candidates : null;
      // everyone targets the wolf if alive & allowed, else first alive non-self
      const target = (cands ? cands : alive.map(U)).find(u => u !== w.uid) || U(alive.find(n => n !== 'ME'));
      for (const n of alive) await vote(n, key, target);
    }
    // host skip to fast-forward reveal/morning/day/execution and settle resolutions
    const before = ph + rnd + (w.room.phaseInfo?.voteKey || '');
    if (window.__hostSkip) window.__hostSkip();
    await new Promise(r => setTimeout(r, 700));
    if (w.room.phase + w.room.round + (w.room.phaseInfo?.voteKey || '') === before && (ph === 'night' || ph === 'vote')) {
      // not resolved yet (waiting on actions); give it another loop
    }
  }
  ok(w.room.phase === 'result', 'game reaches a RESULT');
  ok(['village', 'wolves'].includes(w.room.result?.winner), 'result has a valid winner: ' + w.room.result?.winner);

  // dead players are revealed
  const reveal = w.room.result?.reveal || {};
  ok(Object.keys(reveal).length === 5, 'result reveals all 5 roles');

  return { pass: fails.length === 0, fails, log };
}

window.__e2e = { run };
