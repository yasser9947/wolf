// Morning & execution announcements. SPEC §4.4 / §4.7
import { el, ROLES } from '../util.js';
import { avatarNode } from '../components.js';

export const report = {
  key: 'report',

  mount(root, ctx) {
    this.s = el('section', 'screen screen-report');
    root.append(this.s);
    this.renderedKey = null;
    this.update(ctx);
  },

  update(ctx) {
    const r = ctx.room.report;
    const key = r ? `${r.kind}#${r.round}#${r.victimUid || 'none'}` : 'none';
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    this.s.innerHTML = '';
    if (!r) { this.s.append(el('div', 'boot', '…')); return; }

    if (r.kind === 'morning') this.morning(ctx, r);
    else this.execution(ctx, r);

    // private seer note (their result already shown at night, repeated here)
    if (r.kind === 'morning' && ctx.myRole === 'seer' && ctx.alive) {
      const verdict = ctx.state.secret?.seerResults?.[r.round];
      const target = ctx.state.myNightAction?.type === 'check' ? ctx.state.myNightAction.target : null;
      if (verdict && target) {
        const name = ctx.room.players?.[target]?.name || '؟';
        this.s.append(el('div', 'private-note',
          `👁 لك وحدك: ${name} ${verdict === 'wolf' ? 'ذيب 🐺' : 'مو ذيب 🌿'}`));
      }
    }
  },

  morning(ctx, r) {
    if (r.reason === 'killed') {
      const R = ROLES[r.victimRole] || ROLES.villager;
      this.s.append(el('div', 'report-emoji', '🌅'));
      this.s.append(el('div', 'report-main', `صباح أليم يا أهل الديرة…<br>فقدنا <b>${r.victimName}</b> 💔`));
      const v = el('div', 'report-victim');
      v.append(avatarNode({ avatarIdx: r.victimAvatar }, 'av av-big'));
      v.append(el('span', `role-chip ${r.victimRole === 'wolf' ? 'wolf' : ''}`, `كان ${R.label} ${R.emoji}`));
      this.s.append(v);
    } else if (r.reason === 'saved') {
      this.s.append(el('div', 'report-emoji', '🌿'));
      this.s.append(el('div', 'report-main', 'الحكيم أنقذ الديرة!<br>ما مات أحد الليلة'));
      this.s.append(el('p', 'report-sub', 'الذيابة هجمت… بس يد الحكيم كانت أسرع'));
    } else {
      this.s.append(el('div', 'report-emoji', '🌙'));
      this.s.append(el('div', 'report-main', 'ليلة هادية…<br>ما مات أحد'));
    }
  },

  execution(ctx, r) {
    if (r.tie || !r.victimUid) {
      this.s.append(el('div', 'report-emoji', '🤝'));
      this.s.append(el('div', 'report-main', 'اختلفت الديرة<br>وما طاح أحد'));
      this.s.append(el('p', 'report-sub', 'الذيابة تضحك الحين… غالبًا'));
      return;
    }
    const R = ROLES[r.victimRole] || ROLES.villager;
    this.s.append(el('div', 'report-emoji', '⚔️'));
    this.s.append(el('div', 'report-main', `الديرة قررت…<br><b>${r.victimName}</b> ينطرد`));
    const v = el('div', 'report-victim');
    v.append(avatarNode({ avatarIdx: r.victimAvatar }, 'av av-big'));
    v.append(el('span', `role-chip ${r.victimRole === 'wolf' ? 'wolf' : ''}`,
      r.victimRole === 'wolf' ? `طلع ${R.label}! ${R.emoji} عفية عليكم` : `طلع ${R.label} ${R.emoji}… يا حسافة`));
    this.s.append(v);
  },
};
