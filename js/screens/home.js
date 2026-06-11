// Home: name + create/join (first tap = audio unlock). SPEC §9.1
import { el, toast, rnd } from '../util.js';
import * as audio from '../audio.js';
import { get, set, update, roomRef, serverTimestamp } from '../firebase.js';
import { attachRoom } from '../state.js';

const LS_NAME = 'wolf_name', LS_CODE = 'wolf_code';

export const home = {
  key: 'home',

  mount(root, ctx) {
    const s = el('section', 'screen screen-home');

    const logo = el('div', 'home-logo');
    const img = el('img');
    img.src = 'assets/img/logo.png';
    img.alt = '';
    img.onerror = () => img.remove();
    logo.append(img, el('h1', 'logo-text', 'ذيب الديرة'), el('p', 'tagline', 'مين فينا الذيب؟ 🐺'));

    const name = el('input', 'input');
    name.placeholder = 'وش اسمك يا بعد حيّي؟';
    name.maxLength = 14;
    name.value = localStorage.getItem(LS_NAME) || '';
    name.oninput = () => localStorage.setItem(LS_NAME, name.value.trim());

    const createBtn = el('button', 'btn btn-primary', 'سوّ ديرة 🏕');
    const joinToggle = el('button', 'btn btn-secondary', 'ادخل ديرة 🚪');

    const joinRow = el('div', 'join-row');
    joinRow.hidden = true;
    const codeInput = el('input', 'input code-input');
    codeInput.placeholder = '0000';
    codeInput.inputMode = 'numeric';
    codeInput.maxLength = 4;
    const goBtn = el('button', 'btn btn-primary', 'يلا');
    joinRow.append(codeInput, goBtn);

    s.append(logo, name, createBtn, joinToggle, joinRow,
      el('p', 'hint', 'تجمّعوا ٥ لين ١٤ — مجلس واحد أو كلٌ ببيته'));
    root.append(s);

    const myName = () => name.value.trim();

    createBtn.onclick = async () => {
      if (!myName()) return toast('اكتب اسمك أول 🙏');
      audio.unlock();
      createBtn.disabled = true;
      try {
        let code = '';
        for (let i = 0; i < 6 && !code; i++) {
          const c = String(1000 + rnd(9000));
          const snap = await get(roomRef(c, 'meta'));
          if (!snap.exists()) code = c;
        }
        if (!code) return toast('ازدحام غريب! جرب مرة ثانية');
        await set(roomRef(code, 'meta'), {
          hostUid: ctx.uid, mode: 'majlis', createdAt: serverTimestamp(), dayTimerSec: 180,
        });
        await update(roomRef(code), {
          phase: 'lobby',
          round: 0,
          [`players/${ctx.uid}`]: {
            name: myName(), avatarIdx: rnd(12), alive: true,
            connected: true, joinedAt: serverTimestamp(), misses: 0,
          },
        });
        localStorage.setItem(LS_CODE, code);
        attachRoom(code);
      } catch (e) {
        console.error(e);
        toast(`ما قدرنا نسوّي الديرة 😵 ${e?.code || ''}`);
      } finally {
        createBtn.disabled = false;
      }
    };

    joinToggle.onclick = () => {
      joinRow.hidden = !joinRow.hidden;
      if (!joinRow.hidden) codeInput.focus();
    };
    goBtn.onclick = doJoin;
    codeInput.onkeydown = e => { if (e.key === 'Enter') doJoin(); };

    async function doJoin() {
      const code = codeInput.value.trim();
      if (!myName()) return toast('اكتب اسمك أول 🙏');
      if (!/^\d{4}$/.test(code)) return toast('كود الديرة ٤ أرقام');
      audio.unlock();
      goBtn.disabled = true;
      try {
        const meta = await get(roomRef(code, 'meta'));
        if (!meta.exists()) return toast('ما لقينا الديرة 🤷 تأكد من الكود');
        const [phaseSnap, playersSnap] = await Promise.all([
          get(roomRef(code, 'phase')), get(roomRef(code, 'players')),
        ]);
        const players = playersSnap.val() || {};
        if (!players[ctx.uid]) {
          if (phaseSnap.val() !== 'lobby') return toast('اللعبة بدت بدونك 😅 انطر الجولة الجاية');
          if (Object.keys(players).length >= 14) return toast('الديرة فلّت! ١٤ هو الحد');
          await set(roomRef(code, `players/${ctx.uid}`), {
            name: myName(), avatarIdx: rnd(12), alive: true,
            connected: true, joinedAt: serverTimestamp(), misses: 0,
          });
        }
        localStorage.setItem(LS_CODE, code);
        attachRoom(code);
      } catch (e) {
        console.error(e);
        toast(`ما قدرنا ندخلك 😵 ${e?.code || ''}`);
      } finally {
        goBtn.disabled = false;
      }
    }
  },

  update() { },
};
