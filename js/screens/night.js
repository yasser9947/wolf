// Night: each role gets its own action UI; villagers (and the dead) sleep. SPEC §4.3
import { el, durMs } from '../util.js';
import { set, update, remove, roomRef } from '../firebase.js';
import { pickGrid, countdown } from '../components.js';

export const night = {
  key: 'night',

  mount(root, ctx) {
    this.s = el('section', 'screen screen-night');
    this.head = el('div');
    this.body = el('div');
    this.body.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;gap:10px;';
    this.cd = el('div');
    this.s.append(this.head, this.body, this.cd);
    root.append(this.s);
    this.stopCd = countdown(
      this.cd,
      () => (ctx.room.phaseInfo?.phase === 'night' ? ctx.room.phaseInfo.endsAt : null),
      () => durMs('night', ctx.room.meta),
    );
    this.update(ctx);
  },

  update(ctx) {
    const role = ctx.alive ? (ctx.myRole || 'villager') : 'sleep';
    this.head.innerHTML = '';
    this.body.innerHTML = '';

    if (role === 'wolf') this.wolfUI(ctx);
    else if (role === 'seer') this.seerUI(ctx);
    else if (role === 'doctor') this.doctorUI(ctx);
    else this.sleepUI(ctx, role === 'sleep');
  },

  sleepUI(ctx, dead) {
    this.head.append(el('h2', 'title', 'الليل نزل على الديرة 🌙'));
    const wrap = el('div', 'sleepwrap');
    const stars = el('div', 'stars', '<i style="top:18%;right:20%">✦</i><i style="top:10%;left:25%">✦</i><i style="top:30%;left:60%">✦</i>');
    wrap.append(stars, el('div', 'sleep-moon', dead ? '👻' : '😴'),
      el('p', 'subtitle', dead ? 'انت بالقبر… خل الليل يعدّي' : 'نايم… لا تسوّي صوت'),
      el('p', 'hint', dead ? '' : 'أهل الأدوار قاعدين يشتغلون بالخفاء'));
    this.body.append(wrap);
  },

  wolfUI(ctx) {
    this.head.append(el('h2', 'title', 'يا ذيب الديرة 🐺'),
      el('p', 'subtitle', 'رتّب ضحاياك — كل ليلة ناخذ أول واحد حيّ'));
    const members = ctx.state.wolfChannel?.members || {};
    const wolves = Object.keys(members);
    const hitlist = Array.isArray(ctx.state.wolfChannel?.hitlist) ? ctx.state.wolfChannel.hitlist : [];

    // shared list with the other wolves
    if (wolves.length > 1) {
      const row = el('div', 'wolf-partners');
      for (const wuid of wolves) {
        if (wuid === ctx.uid) continue;
        row.append(el('span', '', `🐺 ${members[wuid]}`));
      }
      this.body.append(row);
    }

    const isAlive = u => ctx.room.players?.[u]?.alive !== false;
    const isWolf = u => wolves.includes(u);
    const orderMap = {};
    hitlist.forEach((u, i) => { orderMap[u] = i + 1; });
    const topAlive = hitlist.find(u => isAlive(u) && !isWolf(u)) || null;

    // auto-submit the top still-alive target to nightActions every night, so the
    // host (who can't read wolfChannel) resolves it WITHOUT the wolf tapping again.
    const cur = this.myTarget(ctx, 'kill');
    if (topAlive && cur !== topAlive) {
      set(roomRef(ctx.code, `nightActions/${ctx.room.round}/${ctx.uid}`), { type: 'kill', target: topAlive }).catch(() => {});
    } else if (!topAlive && cur) {
      remove(roomRef(ctx.code, `nightActions/${ctx.room.round}/${ctx.uid}`)).catch(() => {});
    }

    this.body.append(pickGrid({
      players: ctx.room.players,
      exclude: wolves,        // wolves never eat wolves
      selfUid: ctx.uid,
      orderMap,
      onPick: uid => {
        const list = hitlist.filter(u => u !== uid);
        if (list.length === hitlist.length) list.push(uid); // wasn't in list → append
        set(roomRef(ctx.code, 'wolfChannel/hitlist'), list).catch(() => {});
      },
    }));

    const planNames = hitlist.filter(isAlive).map(u => ctx.room.players?.[u]?.name).filter(Boolean);
    this.body.append(el('p', 'night-status',
      topAlive
        ? `الليلة: ${ctx.room.players?.[topAlive]?.name} 🗡️${planNames.length > 1 ? ` · بعده: ${planNames.slice(1).join(' ← ')}` : ''}`
        : 'ما فيه خطة — لو ما رتّبتوا بنقتل واحد عشوائي 🎲'));
  },

  seerUI(ctx) {
    this.head.append(el('h2', 'title', 'يا شيخ الديرة 🧿'), el('p', 'subtitle', 'مين تبي تكشف عليه الليلة؟'));
    const verdict = ctx.state.secret?.seerResults?.[ctx.room.round];
    const myPick = this.myTarget(ctx, 'check');

    if (verdict && myPick) {
      const name = ctx.room.players?.[myPick]?.name || '؟';
      this.body.append(el('div', 'seer-result',
        verdict === 'wolf' ? `${name} ذيب! 🐺 لا تنام عنه` : `${name} مو ذيب 🌿 نوم العوافي`));
    }
    this.body.append(pickGrid({
      players: ctx.room.players,
      exclude: [ctx.uid],
      selected: myPick,
      selfUid: ctx.uid,
      disabled: !!verdict, // checked already this night
      onPick: uid => set(roomRef(ctx.code, `nightActions/${ctx.room.round}/${ctx.uid}`), { type: 'check', target: uid }),
    }));
    if (!verdict) this.body.append(el('p', 'night-status', myPick ? 'النتيجة على وشك…' : ''));
  },

  doctorUI(ctx) {
    this.head.append(el('h2', 'title', 'يا حكيم الديرة 🌿'), el('p', 'subtitle', 'مين تبي تحمي الليلة؟ (تقدر تحمي نفسك)'));
    const myPick = this.myTarget(ctx, 'save');
    this.body.append(pickGrid({
      players: ctx.room.players,
      selected: myPick,
      selfUid: ctx.uid,
      onPick: uid => set(roomRef(ctx.code, `nightActions/${ctx.room.round}/${ctx.uid}`), { type: 'save', target: uid }),
    }));
    this.body.append(el('p', 'night-status', myPick ? 'حطيت يدك عليه ✓ — تقدر تغيّر' : ''));
  },

  myTarget(ctx, type) {
    const act = ctx.state.myNightAction;
    return act?.type === type ? act.target : null;
  },

  unmount() { this.stopCd?.(); },
};
