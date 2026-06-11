// Day: discussion countdown; online mode adds text chat. SPEC §4.5 / §9.6
import { el, durMs, toast } from '../util.js';
import { push, roomRef, serverTimestamp } from '../firebase.js';
import { countdown } from '../components.js';

export const day = {
  key: 'day',

  mount(root, ctx) {
    this.s = el('section', 'screen screen-day');
    this.cd = el('div');
    this.prompt = el('div', 'day-prompt', 'صحت الديرة ☀️<br>اللي تبون تتهمونه؟ السوالف لكم');
    this.s.append(this.cd, this.prompt);

    this.online = ctx.mode === 'online';
    if (this.online) {
      this.log = el('div', 'chatlog');
      this.row = el('div', 'chat-row');
      this.inp = el('input', 'input');
      this.inp.placeholder = ctx.alive ? 'قول اللي عندك…' : 'الميت يسمع بس 👻';
      this.inp.maxLength = 200;
      this.inp.disabled = !ctx.alive;
      this.sendBtn = el('button', 'btn btn-primary', '↩');
      this.sendBtn.disabled = !ctx.alive;
      this.row.append(this.inp, this.sendBtn);
      this.s.append(this.log, this.row);
      const send = () => {
        const text = this.inp.value.trim();
        if (!text || !ctx.alive) return;
        this.inp.value = '';
        push(roomRef(ctx.code, 'chat'), {
          uid: ctx.uid, name: ctx.me?.name || '؟', text, ts: serverTimestamp(),
        }).catch(() => toast('ما وصلت 😵'));
      };
      this.sendBtn.onclick = send;
      this.inp.onkeydown = e => { if (e.key === 'Enter') send(); };
      this.msgCount = -1;
    } else {
      this.s.append(el('div', 'spacer'),
        el('p', 'hint', 'ناقشوا بصوتكم — الجوال للتصويت والأدوار بس'));
    }

    root.append(this.s);
    this.stopCd = countdown(
      this.cd,
      () => (ctx.room.phaseInfo?.phase === 'day' ? ctx.room.phaseInfo.endsAt : null),
      () => durMs('day', ctx.room.meta),
    );
    this.update(ctx);
  },

  update(ctx) {
    if (!this.online) return;
    const msgs = Object.entries(ctx.room.chat || {})
      .map(([k, m]) => ({ k, ...m }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (msgs.length === this.msgCount) return;
    this.msgCount = msgs.length;
    this.log.innerHTML = '';
    for (const m of msgs) {
      const row = el('div', `msg ${m.uid === ctx.uid ? 'mine' : ''}`);
      row.append(el('b', '', `${m.name}: `), document.createTextNode(m.text));
      this.log.append(row);
    }
    this.log.scrollTop = this.log.scrollHeight;
  },

  unmount() { this.stopCd?.(); },
};
