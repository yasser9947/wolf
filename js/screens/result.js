// Result: winner + full role reveal + replay (host reshuffles same room). SPEC §4.9
import { el, ROLES, toast } from '../util.js';
import { update, remove, roomRef } from '../firebase.js';
import { detachRoom } from '../state.js';
import { avatarNode } from '../components.js';

function leaveToHome(code, uid) {
  remove(roomRef(code, `players/${uid}`)).catch(() => {});
  localStorage.removeItem('wolf_code');
  detachRoom();
}

export const result = {
  key: 'result',

  mount(root, ctx) {
    this.s = el('section', 'screen screen-result');
    root.append(this.s);
    this.rendered = false;
    this.update(ctx);
  },

  update(ctx) {
    const res = ctx.room.result;
    if (!res || this.rendered) {
      if (!res) { this.s.innerHTML = ''; this.s.append(el('div', 'boot', '…')); this.rendered = false; }
      return;
    }
    this.rendered = true;
    this.s.innerHTML = '';

    const village = res.winner === 'village';
    const hero = el('div', 'result-hero');
    hero.append(
      el('div', 'big', village ? '🌴' : '🐺'),
      el('h1', '', village ? 'فازت الديرة!' : 'فازت الذيابة!'),
      el('p', 'subtitle', village ? 'طلّعتوا الذيابة كلها — عفية' : 'الذيابة أكلت الديرة وهي تضحك'),
    );
    this.s.append(hero);

    const list = el('div', 'rolelist');
    const entries = Object.entries(res.reveal || {})
      .sort((a, b) => (a[1].role === 'wolf' ? -1 : 1) - (b[1].role === 'wolf' ? -1 : 1));
    for (const [uid, p] of entries) {
      const R = ROLES[p.role] || ROLES.villager;
      const item = el('div', `item ${p.alive ? '' : 'dead-item'}`);
      item.append(avatarNode(p, 'av'));
      const txt = el('div');
      txt.append(el('b', '', `${p.name}${uid === ctx.uid ? ' (أنت)' : ''} ${p.alive ? '' : '💀'}`));
      txt.append(el('small', '', `${R.label} ${R.emoji}`));
      item.append(txt);
      list.append(item);
    }
    this.s.append(list);

    const actions = el('div', 'result-actions');
    if (ctx.isHost) {
      const again = el('button', 'btn btn-primary', 'العب مرة ثانية 🔁');
      again.onclick = async () => {
        again.disabled = true;
        try {
          const { replay } = await import('../host-engine.js');
          await replay(ctx);
        } catch (e) { console.error(e); toast('ما قدرنا نعيد 😵'); again.disabled = false; }
      };
      const end = el('button', 'btn btn-secondary', 'إنهاء الجلسة 🚪');
      end.onclick = () => {
        // host ends the session: clear all players → everyone drops back to home
        update(roomRef(ctx.code), { players: null }).catch(() => {});
        leaveToHome(ctx.code, ctx.uid);
        toast('انتهت الجلسة 👋');
      };
      actions.append(again, end);
    } else {
      actions.append(el('p', 'subtitle', 'إذا الهوست ضغط «العب مرة ثانية» ترجعون للوبي ⏳'));
      const leave = el('button', 'btn btn-secondary', 'اطلع من الديرة 🚪');
      leave.onclick = () => { leaveToHome(ctx.code, ctx.uid); toast('مع السلامة 👋'); };
      actions.append(leave);
    }
    this.s.append(actions);
  },
};
