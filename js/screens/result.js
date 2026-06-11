// Result: winner + full role reveal + replay (host reshuffles same room). SPEC §4.9
import { el, ROLES, toast } from '../util.js';
import { avatarNode } from '../components.js';

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

    if (ctx.isHost) {
      const again = el('button', 'btn btn-primary', 'العب مرة ثانية 🔁');
      again.onclick = async () => {
        try {
          const { replay } = await import('../host-engine.js');
          await replay(ctx);
        } catch (e) { console.error(e); toast('ما قدرنا نعيد 😵'); }
      };
      this.s.append(again);
    } else {
      this.s.append(el('p', 'subtitle', 'إذا الهوست بغى يعيدها… ترجعون للوبي ⏳'));
    }
  },
};
