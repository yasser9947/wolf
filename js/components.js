// Shared UI builders: avatars, pick grids, countdowns.
import { el, avatarEmoji, avatarImg, fmtMMSS } from './util.js';
import { serverNow } from './state.js';

export function avatarNode(player, cls = 'av') {
  const wrap = el('span', cls);
  wrap.append(el('span', 'av-emoji', avatarEmoji(player?.avatarIdx)));
  const img = el('img');
  img.alt = '';
  img.src = avatarImg(player?.avatarIdx);
  img.onerror = () => img.remove(); // missing asset → emoji fallback stays
  wrap.append(img);
  return wrap;
}

// Grid of player chips (night picks + voting). Re-render on every update — cheap.
// orderMap (uid→1-based rank) renders a numbered badge + selected style — used by
// the wolves' ordered hit-list.
export function pickGrid({ players, exclude = [], only = null, selected = null,
                           votedSet = null, deadShown = false, onPick = null,
                           disabled = false, selfUid = null, badges = {}, orderMap = null }) {
  const grid = el('div', 'pgrid');
  const entries = Object.entries(players || {})
    .filter(([, p]) => deadShown || p.alive !== false)
    .filter(([uid]) => !exclude.includes(uid))
    .filter(([uid]) => !only || only.includes(uid))
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  if (entries.length > 9) grid.classList.add('dense');
  for (const [uid, p] of entries) {
    const chip = el('button', 'pchip');
    chip.type = 'button';
    chip.append(avatarNode(p));
    chip.append(el('b', '', uid === selfUid ? `${p.name} (أنت)` : p.name));
    if (votedSet?.has(uid)) chip.append(el('i', 'voted', '✓'));
    if (badges[uid]) chip.append(el('i', 'pbadge', badges[uid]));
    if (orderMap && orderMap[uid]) { chip.append(el('i', 'rank', orderMap[uid])); chip.classList.add('sel'); }
    if (uid === selected) chip.classList.add('sel');
    if (p.alive === false) chip.classList.add('dead');
    chip.disabled = disabled || p.alive === false || !onPick;
    if (onPick) chip.onclick = () => onPick(uid);
    grid.append(chip);
  }
  return grid;
}

// Countdown (big time + progress bar) driven by phaseInfo.endsAt. Returns stop().
export function countdown(container, getEndsAt, getTotalMs) {
  container.innerHTML = '';
  container.classList.add('cwrap');
  const time = el('div', 'ctime', '…');
  const bar = el('div', 'cbar');
  const fill = el('i');
  bar.append(fill);
  container.append(time, bar);
  const tick = () => {
    const endsAt = getEndsAt();
    if (!endsAt) { time.textContent = '…'; fill.style.width = '100%'; return; }
    const left = endsAt - serverNow();
    time.textContent = fmtMMSS(left);
    const total = getTotalMs() || 1;
    fill.style.width = `${Math.max(0, Math.min(100, (left / total) * 100))}%`;
  };
  tick();
  const iv = setInterval(tick, 250);
  return () => clearInterval(iv);
}
