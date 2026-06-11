export const $ = sel => document.querySelector(sel);

export function el(tag, cls = '', html = '') {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html) n.innerHTML = html;
  return n;
}

export const rnd = n => Math.floor(Math.random() * n);

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// dev flag: ?fast → all phase timers ÷10 (testing full loops quickly)
export const FAST = new URLSearchParams(location.search).has('fast');

// phase durations (seconds) — SPEC §4; day comes from meta.dayTimerSec
export const PHASE_DUR = { reveal: 10, night: 45, morning: 7, vote: 20, execution: 7 };
export function durMs(phase, meta) {
  let s = phase === 'day' ? (meta?.dayTimerSec || 180) : (PHASE_DUR[phase] || 10);
  if (FAST) s = Math.max(2, Math.round(s / 10));
  return s * 1000;
}

export const AVATARS = ['🐪', '🦅', '🐎', '🐐', '🦉', '🐈', '🦊', '🐢', '🐝', '🦁', '🐑', '🦌'];
export const avatarEmoji = idx => AVATARS[Math.abs(idx ?? 0) % AVATARS.length];
export const avatarImg = idx => `assets/img/avatar-${String((Math.abs(idx ?? 0) % 12) + 1).padStart(2, '0')}.png`;

export const ROLES = {
  wolf:     { label: 'ذيب الديرة',    emoji: '🐺', team: 'wolves',  teamLabel: 'فريق الذيابة',   hint: 'كل ليلة تنقي ضحية مع ربعك الذيابة… وبالنهار تمثّل إنك بريء' },
  seer:     { label: 'الشيخ',         emoji: '🧿', team: 'village', teamLabel: 'فريق الديرة',    hint: 'كل ليلة تكشف على واحد: ذيب أو من أهل الديرة' },
  doctor:   { label: 'الحكيم',        emoji: '🌿', team: 'village', teamLabel: 'فريق الديرة',    hint: 'كل ليلة تحمي واحد من ضربة الذيابة — تقدر تحمي نفسك' },
  villager: { label: 'من أهل الديرة', emoji: '🏠', team: 'village', teamLabel: 'فريق الديرة',    hint: 'سولف وحلّل وصوّت — طلّعوا الذيابة قبل ياكلون الديرة' },
};

export const fmtMMSS = ms => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function toast(msg, ms = 2800) {
  const box = $('#toasts');
  if (!box) return;
  const t = el('div', 'toast', msg);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}
