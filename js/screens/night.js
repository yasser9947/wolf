// Night: each role gets its own action UI; villagers (and the dead) sleep. SPEC §4.3
import { el, durMs } from '../util.js';
import { set, update, roomRef } from '../firebase.js';
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
    this.head.append(el('h2', 'title', 'يا ذيب الديرة 🐺'), el('p', 'subtitle', 'مين ضحيتك الليلة؟'));
    const members = ctx.state.wolfChannel?.members || {};
    const picks = ctx.state.wolfChannel?.picks || {};
    const wolves = Object.keys(members);

    if (wolves.length > 1) {
      const row = el('div', 'wolf-partners');
      for (const wuid of wolves) {
        if (wuid === ctx.uid) continue;
        const pickName = picks[wuid] ? (ctx.room.players?.[picks[wuid]]?.name || '؟') : '…';
        row.append(el('span', '', `🐺 ${members[wuid]} → ${pickName}`));
      }
      this.body.append(row);
    }

    const myPick = this.myTarget(ctx, 'kill');
    this.body.append(pickGrid({
      players: ctx.room.players,
      exclude: wolves, // wolves never eat wolves
      selected: myPick,
      selfUid: ctx.uid,
      onPick: uid => {
        set(roomRef(ctx.code, `nightActions/${ctx.room.round}/${ctx.uid}`), { type: 'kill', target: uid });
        update(roomRef(ctx.code, 'wolfChannel/picks'), { [ctx.uid]: uid }).catch(() => {});
      },
    }));
    this.body.append(el('p', 'night-status', myPick ? 'اخترت ✓ — تقدر تغيّر لين يخلص الوقت' : (wolves.length > 1 ? 'اتفقوا… وإذا اختلفتوا القرعة تحسمها' : 'اختر ضحيتك بصمت')));
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
