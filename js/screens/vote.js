// Vote: avatar grid, tally hidden until reveal; tie → revote banner. SPEC §4.6
import { el, durMs } from '../util.js';
import { set, roomRef } from '../firebase.js';
import { pickGrid, countdown } from '../components.js';

export const vote = {
  key: 'vote',

  mount(root, ctx) {
    this.s = el('section', 'screen screen-vote');
    this.head = el('div');
    this.gridBox = el('div');
    this.gridBox.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;gap:8px;';
    this.progress = el('div', 'vote-progress');
    this.cd = el('div');
    this.s.append(this.head, this.gridBox, this.progress, this.cd);
    root.append(this.s);
    this.stopCd = countdown(
      this.cd,
      () => (ctx.room.phaseInfo?.phase === 'vote' ? ctx.room.phaseInfo.endsAt : null),
      () => durMs('vote', ctx.room.meta),
    );
    this.update(ctx);
  },

  update(ctx) {
    const pi = ctx.room.phaseInfo || {};
    const revote = !!pi.revote;
    const candidates = Array.isArray(pi.candidates) ? pi.candidates : null;
    const votes = ctx.room.votes || {};
    const players = ctx.room.players || {};
    const alive = Object.keys(players).filter(u => players[u].alive !== false);
    const myVote = votes[ctx.uid] || null;

    this.head.innerHTML = '';
    this.head.append(el('h2', 'title', 'وقت التصويت 🗳'),
      el('p', 'subtitle', ctx.alive ? 'مين تشكون فيه؟ اضغط صورته' : 'تفرّج بصمت 👻'));
    if (revote && candidates) {
      this.head.append(el('div', 'revote-banner', 'تعادل! صوتوا مرة ثانية — بين هذولا بس 🔁'));
    }

    this.gridBox.innerHTML = '';
    const votedSet = new Set(Object.keys(votes).filter(u => players[u]?.alive !== false));
    this.gridBox.append(pickGrid({
      players,
      exclude: [ctx.uid],            // لا تصوّت على نفسك
      only: candidates,
      selected: myVote,
      selfUid: ctx.uid,
      votedSet,
      disabled: !ctx.alive,
      badges: this.afkBadges(ctx, players),
      onPick: uid => {
        if (!ctx.alive) return;
        const key = pi.voteKey || String(ctx.room.round);
        set(roomRef(ctx.code, `votes/${key}/${ctx.uid}`), uid).catch(() => {});
      },
    }));

    const votedCount = alive.filter(u => votes[u]).length;
    this.progress.textContent = `صوّت ${votedCount} من ${alive.length} — النتيجة تنكشف إذا خلصوا الكل`;
  },

  afkBadges(ctx, players) {
    if (ctx.mode !== 'online') return {};
    const badges = {};
    for (const [uid, p] of Object.entries(players)) {
      if ((p.misses || 0) >= 2) badges[uid] = '💤';
    }
    return badges;
  },

  unmount() { this.stopCd?.(); },
};
