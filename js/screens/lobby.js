// Lobby: huge code, mode + day-timer (host), live presence chips, start. SPEC §9.2
import { el, toast } from '../util.js';
import { update, remove, roomRef } from '../firebase.js';
import { detachRoom } from '../state.js';
import { avatarNode } from '../components.js';
import { joinUrl, whatsappUrl, renderQR } from '../share.js';

export const lobby = {
  key: 'lobby',

  mount(root, ctx) {
    const s = el('section', 'screen screen-lobby');
    this.codeBox = el('div', 'lobby-code');
    this.controls = el('div');
    this.countEl = el('div', 'lobby-count');
    this.grid = el('div', 'pgrid');
    this.footer = el('div');
    s.append(this.codeBox, this.controls, this.countEl, this.grid, this.footer);
    root.append(s);
    this.update(ctx);
  },

  openQR(code) {
    const modal = document.getElementById('qrModal');
    document.getElementById('qrCode').textContent = code;
    modal.hidden = false;
    const close = () => { modal.hidden = true; };
    document.getElementById('qrClose').onclick = close;
    modal.onclick = e => { if (e.target === modal) close(); };
    renderQR(document.getElementById('qrImg'), joinUrl(code), 200);
  },

  update(ctx) {
    const { room, uid, isHost, code } = ctx;
    const meta = room.meta || {};
    const players = room.players || {};
    const count = Object.keys(players).length;

    // code + copy
    this.codeBox.innerHTML = '';
    this.codeBox.append(
      el('small', '', 'كود الديرة — عطه ربعك'),
      el('div', 'num', code),
    );
    const copy = el('button', 'copy-btn', '📋 انسخ الكود');
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(joinUrl(code)); toast('انحفظ رابط الدخول ✅'); }
      catch { toast(code); }
    };
    this.codeBox.append(copy);

    // share row: WhatsApp invite (with deep link) + QR for the person next to you
    const shareRow = el('div', 'share-row');
    const wa = el('a', 'share-btn share-wa', '📲 شارك واتساب');
    wa.href = whatsappUrl(code);
    wa.target = '_blank'; wa.rel = 'noopener';
    const qrBtn = el('button', 'share-btn share-qr', '📷 باركود');
    qrBtn.onclick = () => this.openQR(code);
    shareRow.append(wa, qrBtn);
    this.codeBox.append(shareRow);

    // mode + day timer (host edits, others see)
    this.controls.innerHTML = '';
    const modeLabel = el('div', 'seg-label', 'وضع اللعب');
    const modeSeg = el('div', 'seg');
    for (const [val, label] of [['majlis', '🛋 مجلس — قعدة وحدة'], ['online', '🌐 أونلاين — كل ببيته']]) {
      const b = el('button', meta.mode === val ? 'active' : '', label);
      b.disabled = !isHost;
      b.onclick = () => update(roomRef(code, 'meta'), { mode: val }).catch(() => toast('ما انحفظ 😵'));
      modeSeg.append(b);
    }
    const timerLabel = el('div', 'seg-label', 'وقت السوالف بالنهار');
    const timerSeg = el('div', 'seg');
    for (const [sec, label] of [[120, 'دقيقتين'], [180, '٣ دقايق'], [300, '٥ دقايق']]) {
      const b = el('button', (meta.dayTimerSec || 180) === sec ? 'active' : '', label);
      b.disabled = !isHost;
      b.onclick = () => update(roomRef(code, 'meta'), { dayTimerSec: sec }).catch(() => toast('ما انحفظ 😵'));
      timerSeg.append(b);
    }
    this.controls.append(modeLabel, modeSeg, timerLabel, timerSeg);
    this.controls.style.display = 'flex';
    this.controls.style.flexDirection = 'column';
    this.controls.style.gap = '8px';

    // players
    this.countEl.textContent = `أهل الديرة ${count} / 14 ${count < 5 ? '— تحتاجون ٥ على الأقل' : ''}`;
    this.grid.innerHTML = '';
    this.grid.classList.toggle('dense', count > 9);
    const entries = Object.entries(players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
    for (const [puid, p] of entries) {
      const chip = el('div', 'pchip');
      chip.append(avatarNode(p));
      chip.append(el('b', '', puid === uid ? `${p.name} (أنت)` : p.name));
      chip.append(el('span', `dot ${p.connected === false ? 'off' : ''}`));
      if (puid === meta.hostUid) chip.append(el('span', 'crown', '👑'));
      if (puid === uid) {
        chip.style.cursor = 'pointer';
        chip.title = 'اضغط لتغيير الصورة';
        chip.onclick = () =>
          update(roomRef(code, `players/${uid}`), { avatarIdx: ((p.avatarIdx || 0) + 1) % 12 }).catch(() => {});
        chip.classList.add('sel');
      }
      if (isHost && puid !== uid) {
        const kick = el('button', 'kick', '✕');
        kick.title = 'طرد';
        kick.onclick = e => {
          e.stopPropagation();
          remove(roomRef(code, `players/${puid}`)).then(() => toast(`طلع ${p.name}`)).catch(() => toast('ما قدرنا 😵'));
        };
        chip.append(kick);
      }
      this.grid.append(chip);
    }

    // footer: start (host) / waiting note + leave
    this.footer.innerHTML = '';
    this.footer.style.display = 'flex';
    this.footer.style.flexDirection = 'column';
    this.footer.style.gap = '6px';
    if (isHost) {
      const start = el('button', 'btn btn-primary', count < 5 ? `ناقصكم ${5 - count} 🐪` : 'ابدأ اللعبة 🐺');
      start.disabled = count < 5;
      start.onclick = async () => {
        try {
          const { startGame } = await import('../host-engine.js');
          await startGame(ctx);
        } catch (e) { console.error(e); toast('ما بدت 😵 ' + (e?.code || '')); }
      };
      this.footer.append(start);
    } else {
      this.footer.append(el('p', 'subtitle', 'ننطر الهوست يبدأ اللعبة… ⏳'));
    }
    const leave = el('button', 'linklike', 'اطلع من الديرة');
    leave.onclick = () => {
      remove(roomRef(code, `players/${uid}`)).catch(() => {});
      localStorage.removeItem('wolf_code');
      detachRoom();
    };
    this.footer.append(leave);
  },
};
