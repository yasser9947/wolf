// Reveal: face-down card → tap to flip → your role. SPEC §4.2
import { el, ROLES, durMs } from '../util.js';
import * as audio from '../audio.js';
import { countdown } from '../components.js';

export const reveal = {
  key: 'reveal',

  mount(root, ctx) {
    const s = el('section', 'screen screen-reveal');
    s.append(
      el('h2', 'title', 'وصلتك بطاقتك 🤫'),
      el('p', 'subtitle', 'اضغطها وشوف دورك… ولا تورّي أحد!'),
    );

    this.wrap = el('div', 'flipwrap');
    this.card = el('button', 'fcard');
    this.card.type = 'button';
    const fin = el('div', 'fin');

    const front = el('div', 'face front');
    const backImg = el('img', 'cardimg');
    backImg.src = 'assets/img/card-back.png';
    backImg.alt = '';
    backImg.onerror = () => backImg.remove();
    front.append(backImg, el('div', '', '🐺'), el('div', 'qm', 'اضغط للكشف'));

    this.backFace = el('div', 'face back');
    fin.append(front, this.backFace);
    this.card.append(fin);
    this.wrap.append(this.card);

    this.cd = el('div');
    s.append(this.wrap, this.cd);
    root.append(s);

    this.filledRole = null;
    this.card.onclick = () => {
      if (!ctx.state.secret?.role || this.card.classList.contains('flipped')) return;
      this.card.classList.add('flipped');
      audio.play('card-flip'); // personal sound — always local
    };

    this.stopCd = countdown(
      this.cd,
      () => (ctx.room.phaseInfo?.phase === 'reveal' ? ctx.room.phaseInfo.endsAt : null),
      () => durMs('reveal', ctx.room.meta),
    );
    this.update(ctx);
  },

  update(ctx) {
    const role = ctx.myRole;
    if (!role || this.filledRole === role) return;
    this.filledRole = role;
    const R = ROLES[role];
    this.backFace.className = `face back role-${role}`;
    this.backFace.innerHTML = '';
    const img = el('img', 'cardimg');
    img.src = R.img;
    img.alt = '';
    img.onerror = () => img.remove();
    this.backFace.append(
      img,
      el('div', 'remoji', R.emoji),
      el('h2', '', R.label),
      el('p', '', R.hint),
      el('span', 'team', R.teamLabel),
    );
  },

  unmount() { this.stopCd?.(); },
};
