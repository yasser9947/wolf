// End-to-end + integration tests — run inside the host page against the Firebase
// emulator. Spawns bot players via the SDK, scripts full games, and asserts the
// invariants behind every fix + each role's effect. Usage in console:
//   await import('/tools/e2e.js'); const r = await window.__e2e.runAll();
// Returns { pass, fails:[], log:[] }. Individual: window.__e2e.run5/run8/cards.

const CONFIG = {
  apiKey: 'AIzaSyDVQGEYKgRqWYVP1tx-IEuWBx-QPOvE9Cg',
  authDomain: 'wolf-1ec11.firebaseapp.com',
  databaseURL: 'https://wolf-1ec11-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'wolf-1ec11',
};
const EMU_DB = 'http://127.0.0.1:9000?ns=demo-wolf-default-rtdb';
const BOT_NAMES = ['سعود', 'نورة', 'متعب', 'الجوهرة', 'فيصل', 'ريم', 'بدر', 'هند', 'ناصر', 'لطيفة', 'تركي', 'موضي', 'خالد'];

const log = [], fails = [];
let SDK = null;
const w = () => window.__wolf;
const say = m => { log.push(m); console.log('[e2e]', m); };
const ok = (c, m) => { if (!c) { fails.push(m); console.error('[e2e] FAIL:', m); } else say('✓ ' + m); return c; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = (cond, ms = 22000, label = '') => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    let v = false; try { v = cond(); } catch {}
    if (v) { clearInterval(iv); res(true); }
    else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timeout: ' + label)); }
  }, 120);
});

async function sdk() {
  if (SDK) return SDK;
  const [appM, authM, dbM] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.4.0/firebase-database.js'),
  ]);
  const fb = await import('/js/firebase.js');
  SDK = { appM, authM, dbM, fb };
  return SDK;
}

// ---- card integrity (pure; no emulator) — "every card works right" + double-emoji guard ----
async function cards() {
  const { roleCardSVG, cardBackSVG } = await import('/js/cards.js');
  const expect = { wolf: ['🐺', 'ذيب الديرة'], seer: ['🧿', 'الشيخ'], doctor: ['🌿', 'الحكيم'], villager: ['🏠', 'من أهل الديرة'] };
  for (const [role, [emoji, name]] of Object.entries(expect)) {
    const svg = roleCardSVG(role);
    ok(svg.startsWith('<svg') && svg.includes('</svg>'), `card ${role}: well-formed SVG`);
    ok(svg.includes(name), `card ${role}: shows name "${name}"`);
    // exactly ONE medallion emoji (the double-emoji regression guard)
    const count = svg.split(emoji).length - 1;
    ok(count === 1, `card ${role}: exactly one ${emoji} emblem (got ${count})`);
  }
  const back = cardBackSVG();
  ok(back.includes('🌙') && back.includes('ذيب الديرة'), 'card back: moon + wordmark');
  ok(roleCardSVG('bogus').includes('من أهل الديرة'), 'unknown role falls back to villager card');
}

// ---- spawn a host room + N bots, return context + action helpers ----
async function setupGame(botCount, label) {
  const { appM, authM, dbM, fb } = await sdk();
  // self-heal back to home if a previous game left us in a room
  if (!document.querySelector('.screen-home .input') && window.__leaveRoom) {
    window.__leaveRoom();
    await until(() => !!document.querySelector('.screen-home .input'), 8000, 'back to home');
  }
  window.localStorage.removeItem('wolf_code');
  // (re)create the host room from the home screen
  const nameInput = document.querySelector('.screen-home .input');
  if (!nameInput) throw new Error('not on home screen (reload with ?emu&fast)');
  nameInput.value = 'أبو فهد'; nameInput.dispatchEvent(new Event('input'));
  document.querySelector('.btn-primary').click();
  await until(() => w().code && w().room.phase === 'lobby', 15000, 'room created');
  const code = w().code;

  const bots = [];
  for (let i = 0; i < botCount; i++) {
    const tag = `${label}${i}`;
    let app; try { app = appM.getApp(tag); } catch { app = appM.initializeApp(CONFIG, tag); }
    const auth = authM.getAuth(app);
    authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const db = dbM.getDatabase(app, EMU_DB);
    const cred = auth.currentUser ? { user: auth.currentUser } : await authM.signInAnonymously(auth);
    await dbM.set(dbM.ref(db, `rooms/${code}/players/${cred.user.uid}`), {
      name: BOT_NAMES[i], avatarIdx: (i + 1) % 12, alive: true, connected: true,
      joinedAt: dbM.serverTimestamp(), misses: 0,
    });
    bots.push({ uid: cred.user.uid, name: BOT_NAMES[i], db, m: dbM });
  }
  await until(() => Object.keys(w().room.players || {}).length === botCount + 1, 9000, 'lobby full');

  const byName = {}; bots.forEach(b => byName[b.name] = b);
  const U = n => n === 'ME' ? w().uid : byName[n].uid;
  const nameOf = u => u === w().uid ? 'ME' : (bots.find(b => b.uid === u)?.name || u.slice(0, 5));
  const roleOf = async u => u === w().uid
    ? w().secret?.role
    : (await byName[nameOf(u)].m.get(byName[nameOf(u)].m.ref(byName[nameOf(u)].db, `rooms/${code}/secrets/${u}`))).val()?.role;
  const act = (n, round, type, target) => n === 'ME'
    ? fb.set(fb.roomRef(code, `nightActions/${round}/${w().uid}`), { type, target }).catch(() => {})
    : byName[n].m.set(byName[n].m.ref(byName[n].db, `rooms/${code}/nightActions/${round}/${byName[n].uid}`), { type, target }).catch(() => {});
  const vote = (n, key, target) => n === 'ME'
    ? fb.set(fb.roomRef(code, `votes/${key}/${w().uid}`), target).catch(() => {})
    : byName[n].m.set(byName[n].m.ref(byName[n].db, `rooms/${code}/votes/${key}/${byName[n].uid}`), target).catch(() => {});

  return { code, bots, byName, U, nameOf, roleOf, act, vote, allNames: ['ME', ...bots.map(b => b.name)] };
}

async function dealRoles(g) {
  document.querySelector('.screen-lobby .btn-primary').click(); // ابدأ
  await until(() => w().room.phase === 'reveal', 10000, 'reveal');
  await until(() => !!w().secret?.role, 8000, 'my role');
  const roles = {};
  for (const u of Object.keys(w().room.players)) roles[g.nameOf(u)] = await g.roleOf(u);
  return roles;
}

// ---- 5-player game: doctor-save→no-death, الشيخ BOTH verdicts, race guard, completion ----
async function run5() {
  say('— run5 (5 players, 1 wolf) —');
  const g = await setupGame(4, 'a');
  const roles = await dealRoles(g);
  say('roles ' + JSON.stringify(roles));
  const wolves = Object.keys(roles).filter(n => roles[n] === 'wolf');
  const seerN = Object.keys(roles).find(n => roles[n] === 'seer');
  const docN = Object.keys(roles).find(n => roles[n] === 'doctor');
  const villagers = Object.keys(roles).filter(n => roles[n] === 'villager');
  ok(wolves.length === 1, '5p → exactly 1 wolf');
  ok(!!seerN, 'exactly 1 الشيخ (seer)');
  ok(!!docN, 'exactly 1 الحكيم (doctor)');
  ok(villagers.length === 2, '5p → 2 villagers');
  const wolfN = wolves[0];

  // ROUND 1 NIGHT: doctor saves the wolf's target → no death; الشيخ checks the WOLF → "wolf"
  await until(() => w().room.phase === 'night' && w().room.round === 1, 12000, 'night1');
  const prey1 = villagers[0];
  await g.act(wolfN, 1, 'kill', g.U(prey1));
  await g.act(docN, 1, 'save', g.U(prey1));
  await g.act(seerN, 1, 'check', g.U(wolfN));
  await until(() => w().room.phase === 'morning' && w().room.round === 1, 15000, 'morning1');
  ok(w().room.report?.reason === 'saved', 'doctor save on wolf-target → no death (reason=saved)');
  ok(w().room.players[g.U(prey1)]?.alive !== false, 'saved player still alive');
  const seerUid = g.U(seerN);
  const { fb } = SDK;
  const v1 = (await fb.get(fb.roomRef(g.code, `secrets/${seerUid}/seerResults/1`))).val();
  ok(v1 === 'wolf', 'الشيخ check on a WOLF → "wolf"');

  // ROUND 1 day/vote: everyone abstains-ish → no execution (skip-driven), reach round 2 night
  await until(() => w().room.phase === 'day', 15000, 'day1');
  await until(() => w().room.phase === 'vote', 30000, 'vote1');
  // nobody votes → tie/no-execution path; let timer/skip resolve
  if (window.__hostSkip) window.__hostSkip();
  await until(() => w().room.phase === 'execution' || w().room.phase === 'result', 30000, 'exec1');

  // ROUND 2 NIGHT: the race-guard assertion + الشيخ checks a NON-wolf → "notwolf"
  if (w().room.phase !== 'result') {
    await until(() => w().room.phase === 'night' && w().room.round === 2, 16000, 'night2');
    // CRITICAL: must NOT auto-resolve before any action
    const t0 = Date.now(); let auto = false;
    while (Date.now() - t0 < 2500) { if (w().room.phase !== 'night') { auto = true; break; } await sleep(150); }
    ok(!auto, 'round-2 night does NOT auto-resolve before any action (race guard)');

    const alive2 = g.allNames.filter(n => w().room.players[g.U(n)]?.alive !== false);
    const seerAlive = alive2.includes(seerN);
    const otherVillager = villagers.find(n => alive2.includes(n) && n !== seerN) || alive2.find(n => roles[n] !== 'wolf' && n !== seerN);
    if (seerAlive && otherVillager) {
      await g.act(seerN, 2, 'check', g.U(otherVillager)); // check a non-wolf
    }
    if (alive2.includes(wolfN)) {
      const prey2 = alive2.find(n => n !== wolfN && roles[n] !== 'doctor') || alive2.find(n => n !== wolfN);
      await g.act(wolfN, 2, 'kill', g.U(prey2));
    }
    if (alive2.includes(docN)) await g.act(docN, 2, 'save', g.U(docN)); // doctor SELF-save
    await until(() => w().room.phase === 'morning' && w().room.round === 2, 16000, 'morning2');
    ok(w().room.report?.round === 2, 'round-2 morning is for round 2 (fresh resolution, not stale)');
    if (seerAlive && otherVillager) {
      const v2 = (await fb.get(fb.roomRef(g.code, `secrets/${seerUid}/seerResults/2`))).val();
      ok(v2 === 'notwolf', 'الشيخ check on a NON-wolf → "notwolf"');
    }
  }

  await driveToResult(g, roles);
  ok(w().room.phase === 'result', 'run5 reaches RESULT');
  ok(['village', 'wolves'].includes(w().room.result?.winner), 'run5 valid winner: ' + w().room.result?.winner);
  ok(Object.keys(w().room.result?.reveal || {}).length === 5, 'run5 reveals all 5 roles');
}

// ---- 8-player game: 2 wolves, wolf-kill death (no save), completion ----
async function run8() {
  say('— run8 (8 players, 2 wolves) —');
  const g = await setupGame(7, 'b');
  const roles = await dealRoles(g);
  const wolves = Object.keys(roles).filter(n => roles[n] === 'wolf');
  ok(wolves.length === 2, '8p → exactly 2 wolves');
  ok(Object.keys(roles).filter(n => roles[n] === 'seer').length === 1, '8p → 1 الشيخ');
  ok(Object.keys(roles).filter(n => roles[n] === 'doctor').length === 1, '8p → 1 الحكيم');
  const docN = Object.keys(roles).find(n => roles[n] === 'doctor');

  // ROUND 1 NIGHT: both wolves agree on a prey; doctor protects SOMEONE ELSE → a real death
  await until(() => w().room.phase === 'night' && w().room.round === 1, 12000, 'night1');
  const alive = g.allNames.filter(n => w().room.players[g.U(n)]?.alive !== false);
  const prey = alive.find(n => roles[n] === 'villager') || alive.find(n => !wolves.includes(n) && n !== docN);
  for (const wf of wolves) await g.act(wf, 1, 'kill', g.U(prey));
  const protectee = alive.find(n => n !== prey && !wolves.includes(n));
  if (docN) await g.act(docN, 1, 'save', g.U(protectee)); // protect someone else → prey dies
  await until(() => w().room.phase === 'morning', 16000, 'morning1');
  ok(w().room.report?.victimUid === g.U(prey), '8p: both wolves agree → that player dies (no save)');

  await driveToResult(g, roles);
  ok(w().room.phase === 'result', 'run8 reaches RESULT');
  ok(['village', 'wolves'].includes(w().room.result?.winner), 'run8 valid winner: ' + w().room.result?.winner);
  ok(Object.keys(w().room.result?.reveal || {}).length === 8, 'run8 reveals all 8 roles');
}

// ---- silence → random kill: no wolf submits a night action → someone still dies ----
async function runSilence() {
  say('— runSilence (no wolf action → random kill) —');
  const g = await setupGame(4, 'c');
  const roles = await dealRoles(g);
  await until(() => w().room.phase === 'night' && w().room.round === 1, 12000, 'night1');
  await sleep(900); // let the (empty) round-1 actions snapshot load
  // nobody submits anything (no bot acts; host doesn't tap) → host must random-kill
  for (let i = 0; i < 10 && w().room.phase === 'night'; i++) { window.__hostSkip(); await sleep(500); }
  await until(() => w().room.phase === 'morning', 16000, 'morning1');
  const r = w().room.report;
  ok(r?.reason === 'killed' && !!r.victimUid, 'no wolf action → a player is still killed (random)');
  if (r?.victimUid) ok(roles[g.nameOf(r.victimUid)] !== 'wolf', 'random victim is never a wolf');
  await driveToResult(g, roles);
  ok(w().room.phase === 'result', 'runSilence reaches RESULT');
}

// drive any game to a terminal RESULT with role-appropriate actions + host skip
async function driveToResult(g, roles) {
  let guard = 0;
  while (w().room.phase !== 'result' && guard++ < 60) {
    const ph = w().room.phase, rnd = w().room.round;
    const alive = g.allNames.filter(n => w().room.players[g.U(n)]?.alive !== false);
    if (ph === 'night') {
      for (const n of alive) {
        const r = roles[n];
        if (r === 'wolf') { const t = alive.find(x => x !== n && roles[x] !== 'wolf'); if (t) await g.act(n, rnd, 'kill', g.U(t)); }
        else if (r === 'seer') { const t = alive.find(x => x !== n); if (t) await g.act(n, rnd, 'check', g.U(t)); }
        else if (r === 'doctor') await g.act(n, rnd, 'save', g.U(n));
      }
    } else if (ph === 'vote') {
      const key = w().room.phaseInfo?.voteKey || String(rnd);
      const cands = Array.isArray(w().room.phaseInfo?.candidates) ? w().room.phaseInfo.candidates : null;
      // village lynches a wolf if possible → games converge to a winner
      const wolfTarget = alive.find(n => roles[n] === 'wolf' && (!cands || cands.includes(g.U(n))));
      const target = wolfTarget ? g.U(wolfTarget) : (cands ? cands[0] : g.U(alive.find(n => n !== 'ME')));
      for (const n of alive) await g.vote(n, key, target);
    }
    if (window.__hostSkip) window.__hostSkip();
    await sleep(700);
  }
}

async function runAll() {
  log.length = 0; fails.length = 0;
  try {
    await cards();
    await run5();
    await run8(); // setupGame() self-heals back to home from the prior result screen
    await runSilence();

  } catch (e) {
    fails.push('THREW: ' + (e?.message || e));
    console.error('[e2e] threw', e);
  }
  const res = { pass: fails.length === 0, fails, log: [...log] };
  console.log('[e2e] DONE', res.pass ? 'PASS' : 'FAIL', res);
  return res;
}

window.__e2e = { runAll, run5, run8, cards, _state: { log, fails } };
