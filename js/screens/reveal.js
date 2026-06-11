// Reveal: face-down card → tap to flip → your role. SPEC §4.2
// Cards are inline SVG (js/cards.js): always render, on-brand, single emblem.
import { el, durMs } from '../util.js';
import * as audio from '../audio.js';
import { countdown } from '../components.js';
import { roleCardSVG, cardBackSVG } from '../cards.js';

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

    this.front = el('div', 'face front');
    this.front.innerHTML = cardBackSVG();

    this.backFace = el('div', 'face back');
    fin.append(this.front, this.backFace);
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
    this.backFace.innerHTML = roleCardSVG(role);
  },

  unmount() { this.stopCd?.(); },
};
