# ذيب الديرة — Saudi Werewolf Game · Full Specification

> **Read this entire file before writing any code.** This is the single source of truth.
> Build order is defined in §10. Do NOT skip the style-guide milestone.

---

## 1. Concept

A mobile-first, Arabic (RTL), Saudi/Najdi-themed Werewolf (Mafia) social deduction game.
- An informed minority (**الذيابة** / wolves) vs an uninformed majority (**أهل الديرة** / villagers).
- Two play modes selected at room creation:
  - **مجلس (Majlis):** players sit together physically; phones handle secret night actions + voting; discussion is verbal.
  - **أونلاين (Online):** fully remote; adds a text chat during the day phase and AFK auto-skip.
- 100% free infrastructure: Firebase RTDB (Spark plan) + Anonymous Auth + GitHub Pages. **No Cloud Functions.**
- The **host plays** as a normal player AND acts as the technical authority (their client resolves night actions and advances phases).

## 2. Tech Stack (strict)

- Vanilla HTML + CSS + JS (ES modules). **No framework, no build step.** Must deploy as static files to GitHub Pages.
- Firebase JS SDK v12 via CDN (`firebase-app.js`, `firebase-auth.js`, `firebase-database.js`). Do NOT include analytics.
- Single-page app: `index.html` + `/js` modules + `/css` + `/assets` (images, sounds).

### Firebase config (use exactly this — note the added databaseURL)

```js
const firebaseConfig = {
  apiKey: "AIzaSyDVQGEYKgRqWYVP1tx-IEuWBx-QPOvE9Cg",
  authDomain: "wolf-1ec11.firebaseapp.com",
  databaseURL: "https://wolf-1ec11-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "wolf-1ec11",
  storageBucket: "wolf-1ec11.firebasestorage.app",
  messagingSenderId: "295565126678",
  appId: "1:295565126678:web:41b9957c96471f0e059937"
};
```

Sign in every visitor with `signInAnonymously()` on load before anything else.

## 3. Roles (MVP — exactly these four)

| Role | Arabic name | Team | Night action |
|---|---|---|---|
| Wolf | **ذيب الديرة** 🐺 | Wolves | Wolves agree on one victim per night |
| Seer | **العرّاف** 👁 | Village | Checks one player → learns "ذيب" / "مو ذيب" |
| Doctor | **الحكيم** 🌿 | Village | Protects one player (self allowed) from the wolf kill |
| Villager | **من أهل الديرة** 🏠 | Village | None |

**Distribution by player count (auto):**
- 5–6 players → 1 wolf, 1 seer, 1 doctor, rest villagers
- 7–9 players → 2 wolves, 1 seer, 1 doctor, rest villagers
- 10–14 players → 3 wolves, 1 seer, 1 doctor, rest villagers

Min players: **5**. Max: **14**.

**Multiple wolves choosing a victim:** each wolf submits a target; if they differ, the kill target is chosen randomly among submitted targets (weighted by votes). Wolves can see each other's identity and each other's current pick (live) in the wolf night screen.

## 4. Game flow (state machine)

Each phase = one full screen. `rooms/{code}/phase` drives everything; all clients render from it.

```
LOBBY → REVEAL → (NIGHT → MORNING_REPORT → DAY → VOTE → EXECUTION_REPORT)* → RESULT
```

1. **LOBBY** — room code (4 digits), player list with live presence, mode badge (مجلس/أونلاين). Host has "ابدأ اللعبة" button (enabled at ≥5 players).
2. **REVEAL** — each player sees a face-down card; tap to flip → their role card (image + name + one-line mission). 10s timer, then host client advances.
3. **NIGHT** — screen goes dark-night theme. Each role sees its own action UI; villagers see a "نايم 😴" screen with a calm animation. Timer: 45s (or all actions submitted → advance early).
4. **MORNING_REPORT** — rooster sound, day theme transition. Announce victim ("صباح أليم… فقدنا فلان") with role reveal, or "الحكيم أنقذ الديرة، ما مات أحد". Dead players become spectators (can watch everything but never interact; in online mode they get a read-only chat).
5. **DAY** —
   - Majlis mode: big countdown timer (host-configurable in lobby: 2/3/5 min) + "اللي تبون تتهمونه؟" — discussion is verbal.
   - Online mode: same timer + text chat (`chat` node). Simple messages, no media.
6. **VOTE** — grid of alive players' avatars; tap to vote. Live tally is hidden until everyone votes (or timer 30s ends). Majority → execution. Tie → one revote between tied players only; still tie → no execution ("اختلفت الديرة وما طاح أحد").
7. **EXECUTION_REPORT** — sword sound, reveal executed player's role.
8. **Win check** after every death:
   - Wolves = 0 → **فازت الديرة** 🌴
   - Wolves ≥ alive non-wolves → **فازت الذيابة** 🐺
9. **RESULT** — winner screen, full role reveal of all players, "العب مرة ثانية" (same room, host reshuffles).

**AFK handling (online mode):** if timer expires without action → night action = none, vote = abstain. Player flagged after 2 consecutive misses with a 💤 badge.

**Host disconnect:** show banner "الهوست فصل… اللعبة موقفة" using `onDisconnect()` presence; resume when back. (No host migration in MVP.)

## 5. RTDB data model

```
rooms/{code}/
  meta: { hostUid, mode: "majlis"|"online", createdAt, dayTimerSec }
  phase: "lobby"|"reveal"|"night"|"morning"|"day"|"vote"|"execution"|"result"
  round: 1
  players/{uid}: { name, avatarIdx, alive: true, connected: true, joinedAt }
  secrets/{uid}: { role: "wolf"|"seer"|"doctor"|"villager", seerResults: { round: "wolf"|"notwolf" } }
  wolfChannel: { members: { uid: name }, picks: { uid: targetUid } }
  nightActions/{round}/{uid}: { type: "kill"|"check"|"save", target: uid }
  votes/{round}/{uid}: targetUid | "abstain"
  publicLog: push list of announcement strings
  chat: push { uid, name, text, ts }   // online mode only
  result: { winner: "wolves"|"village", reveal: {...} }
```

Players write **only their own** nodes. The **host client** is the only writer of: `phase`, `round`, `secrets/*`, `wolfChannel`, `publicLog`, `result`, and players' `alive` flags. Host resolves night = reads `nightActions`, applies doctor save vs wolf kill, writes seer result into the seer's `secrets`, then advances phase.

## 6. Security Rules (deploy to RTDB — adjust paths if model changes, keep the guarantees)

Guarantees:
1. A player can read **only their own** `secrets/{uid}`.
2. `wolfChannel` readable **only** if your own secret role == "wolf".
3. `nightActions/{round}/{uid}` and `votes/{round}/{uid}` writable only by that uid; `nightActions` readable only by host + owner.
4. Host-only nodes writable only by `meta/hostUid`.

```json
{
  "rules": {
    "rooms": {
      "$code": {
        "meta":      { ".read": "auth != null", ".write": "auth != null && (!data.exists() || data.child('hostUid').val() === auth.uid)" },
        "phase":     { ".read": "auth != null", ".write": "root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid" },
        "round":     { ".read": "auth != null", ".write": "root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid" },
        "players": {
          ".read": "auth != null",
          "$uid": { ".write": "auth != null && (auth.uid === $uid || root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid)" }
        },
        "secrets": {
          "$uid": {
            ".read": "auth.uid === $uid",
            ".write": "root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid"
          }
        },
        "wolfChannel": {
          ".read": "root.child('rooms').child($code).child('secrets').child(auth.uid).child('role').val() === 'wolf'",
          "picks": { "$uid": { ".write": "auth.uid === $uid" } },
          "members": { ".write": "root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid" }
        },
        "nightActions": {
          "$round": {
            "$uid": {
              ".read": "auth.uid === $uid || root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid",
              ".write": "auth.uid === $uid"
            }
          }
        },
        "votes": {
          "$round": {
            ".read": "auth != null",
            "$uid": { ".write": "auth.uid === $uid" }
          }
        },
        "publicLog": { ".read": "auth != null", ".write": "root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid" },
        "chat":      { ".read": "auth != null", "$msg": { ".write": "auth != null && newData.child('uid').val() === auth.uid" } },
        "result":    { ".read": "auth != null", ".write": "root.child('rooms').child($code).child('meta/hostUid').val() === auth.uid" }
      }
    }
  }
}
```

Note: vote tallies are technically readable live; the "hidden until all vote" behavior is UI-level only — acceptable for a friends game.

## 7. Design system (strict — build `styleguide.html` FIRST)

**Identity:** Najdi / Sadu. Night-first. The phase transition (night ⇄ day) is the signature moment: full-screen 1.5s gradient cross-fade + sound.

### Tokens

```css
:root {
  /* Night (default) */
  --bg-night-1: #0D1321;  --bg-night-2: #1A2238;
  --accent-danger: #A4262C;   /* Sadu red — wolves, death */
  --accent-cta: #E8843C;      /* lantern orange — buttons */
  --text-main: #F2E9DC;       /* warm ivory */
  /* Day */
  --bg-day-1: #E5D5B7;  --bg-day-2: #D4B896;
  --day-text: #3E2C1C;  --accent-day: #6B4226;
  --accent-vote: #2F5D3A;     /* palm green */
}
```

- **Fonts (Google Fonts):** `Marhey` for headings/logo, `IBM Plex Sans Arabic` for body. `dir="rtl"` `lang="ar"` on `<html>`.
- **Sadu strip:** a thin repeating-triangle CSS/SVG border fixed at top & bottom of every screen, in `--accent-danger` + `--accent-cta`. This is the brand mark — never remove it.
- **Layout:** `height: 100dvh`, `overflow: hidden`, flex column. **Zero vertical scroll on any screen** at 360×640 and up. Respect `env(safe-area-inset-*)`. Buttons min-height 48px.
- Cards/avatars: rounded-xl, soft inner glow on night screens (lantern feel). No harsh white anywhere.

### styleguide.html must show
Color swatches, both fonts, primary/secondary buttons, a player card, the Sadu strip, a night-screen sample and a day-screen sample, and the phase-transition animation on a toggle button. **Stop after this milestone for human approval.**

## 8. Assets

### Images — generated externally (Nano Banana), placed in `/assets/img/`
Expected files (use as `<img>`/backgrounds; ship with a simple colored-placeholder fallback if a file is missing):
`card-back.png, card-wolf.png, card-seer.png, card-doctor.png, card-villager.png, bg-night.png, bg-day.png, logo.png, avatar-01..12.png`

### Sounds — CC0, placed in `/assets/sfx/` (human will download; code against these names)
`wolf-howl.mp3, rooster.mp3, sword.mp3, drum.mp3, save.mp3, card-flip.mp3, win-village.mp3, win-wolves.mp3, night-wind.mp3 (loop, low volume)`

### Audio rules
- Mobile autoplay restriction: unlock AudioContext on the first user tap (the "ادخل الديرة" button). Preload all sfx after unlock.
- **Majlis mode:** ambient/event sounds (howl, rooster, drum, win) play **on the host device only**; personal sounds (card-flip, "انت انذبحت") play on the player's own device.
- **Online mode:** everything plays locally on each device.
- Mute toggle 🔇 persisted in `localStorage`.

## 9. Screens (all full-screen, no scroll)

1. **Home** — logo, name input (persisted in localStorage), "سوّ ديرة" / "ادخل ديرة" (4-digit code input). First tap = audio unlock.
2. **Lobby** — code displayed huge + copy button, mode toggle (host only, before start), day-timer select, player chips with presence dots, start button.
3. **Reveal** — flip card.
4. **Night** — per-role action screens + sleeping screen.
5. **Morning report / Execution report** — announcement overlays.
6. **Day** — timer (+ chat in online mode).
7. **Vote** — avatar grid.
8. **Result** — winner + full reveal + replay.
9. **Spectator overlay** for dead players ("انت بالقبر، تفرّج بصمت 👻").

## 10. Build order (milestones — commit after each)

1. `styleguide.html` → **STOP for approval.**
2. Skeleton SPA + Firebase init + anonymous auth + room create/join + lobby with presence (`onDisconnect`).
3. Role assignment (host shuffles on start) + secrets writes + REVEAL screen.
4. NIGHT phase: role action UIs + host resolution logic + MORNING_REPORT.
5. DAY + VOTE + EXECUTION + win conditions + RESULT + replay.
6. Online-mode extras: chat, AFK auto-skip.
7. Sounds + transitions + polish + Security Rules file (`database.rules.json`) + README with deploy steps.

## 11. Quality bar

- Test mentally against: 5 players (1 wolf) and 8 players (2 wolves) full game loop.
- Doctor saving the wolf target must produce "no death" morning.
- Dead players must never be able to act, vote, or appear in target lists.
- Refresh mid-game must restore the player to the correct screen (rejoin by uid).
- Everything in Arabic; numbers can be Latin digits.
