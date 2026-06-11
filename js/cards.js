// Inline SVG role cards — Najdi/Sadu themed, drawn in-document so they inherit
// the page fonts (Marhey) and color tokens. No image files, always render, and
// crucially: ONE emblem per card (kills the double-emoji the reveal had).
// Each returns an <svg> string for innerHTML injection.

const VB = 'viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"';

// a repeating Sadu triangle band (the brand motif) as a <g> of polygons
function saduBand(y, flip, cA, cB) {
  let tris = '';
  for (let i = 0; i < 10; i++) {
    const x = i * 26;
    const col = i % 2 ? cA : cB;
    tris += flip
      ? `<polygon points="${x},${y + 13} ${x + 13},${y} ${x + 26},${y + 13}" fill="${col}"/>`
      : `<polygon points="${x},${y} ${x + 13},${y + 13} ${x + 26},${y}" fill="${col}"/>`;
  }
  return `<g>${tris}</g>`;
}

// corner Sadu diamonds
function diamonds(color) {
  const d = (cx, cy) => `<path d="M${cx} ${cy - 9} L${cx + 7} ${cy} L${cx} ${cy + 9} L${cx - 7} ${cy} Z" fill="none" stroke="${color}" stroke-width="1.5" opacity=".5"/>`;
  return d(28, 70) + d(222, 70) + d(28, 280) + d(222, 280);
}

// shared frame: gradient bg + Sadu bands top/bottom + corner diamonds
function frame(id, c1, c2, border, bandA, bandB, diamond) {
  return `
    <defs>
      <linearGradient id="g-${id}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
      </linearGradient>
      <radialGradient id="glow-${id}" cx="50%" cy="40%" r="55%">
        <stop offset="0" stop-color="${border}" stop-opacity=".28"/>
        <stop offset="1" stop-color="${border}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect x="3" y="3" width="244" height="344" rx="20" fill="url(#g-${id})" stroke="${border}" stroke-width="3"/>
    <rect x="3" y="3" width="244" height="344" rx="20" fill="url(#glow-${id})"/>
    ${saduBand(16, false, bandA, bandB)}
    ${saduBand(321, true, bandA, bandB)}
    ${diamonds(diamond)}`;
}

function medallion(emoji, ring) {
  return `
    <circle cx="125" cy="138" r="58" fill="rgba(0,0,0,.28)" stroke="${ring}" stroke-width="2.5"/>
    <circle cx="125" cy="138" r="58" fill="none" stroke="${ring}" stroke-width="1" opacity=".4" stroke-dasharray="3 5"/>
    <text x="125" y="138" font-size="62" text-anchor="middle" dominant-baseline="central">${emoji}</text>`;
}

function label(name, mission, nameColor) {
  return `
    <text x="125" y="232" font-family="Marhey, sans-serif" font-weight="700" font-size="30"
          text-anchor="middle" fill="${nameColor}">${name}</text>
    <foreignObject x="24" y="248" width="202" height="62">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:'IBM Plex Sans Arabic',sans-serif;
           font-size:12.5px;line-height:1.55;color:var(--text-main);opacity:.82;text-align:center;direction:rtl">
        ${mission}
      </div>
    </foreignObject>`;
}

const CARDS = {
  wolf: {
    emoji: '🐺', name: 'ذيب الديرة', ring: '#E8843C', nameColor: '#F2E9DC',
    mission: 'كل ليلة تنقي ضحية مع ربعك الذيابة… وبالنهار مثّل إنك بريء',
    c1: '#3A1518', c2: '#190A0B', border: '#A4262C', bandA: '#A4262C', bandB: '#E8843C', diamond: '#E8843C',
  },
  seer: {
    emoji: '🧿', name: 'الشيخ', ring: '#8FA6E0', nameColor: '#F2E9DC',
    mission: 'كل ليلة تكشف على واحد: تعرف ذيب ولا من أهل الديرة',
    c1: '#1F2A4A', c2: '#0E1426', border: '#6F86C9', bandA: '#6F86C9', bandB: '#E8843C', diamond: '#8FA6E0',
  },
  doctor: {
    emoji: '🌿', name: 'الحكيم', ring: '#5FBF7A', nameColor: '#F2E9DC',
    mission: 'كل ليلة تحمي واحد من ضربة الذيابة — وتقدر تحمي نفسك',
    c1: '#16331F', c2: '#0B1A10', border: '#2F5D3A', bandA: '#2F5D3A', bandB: '#E8843C', diamond: '#5FBF7A',
  },
  villager: {
    emoji: '🏠', name: 'من أهل الديرة', ring: '#D9A866', nameColor: '#F2E9DC',
    mission: 'سولف وحلّل وصوّت — طلّعوا الذيابة قبل ياكلون الديرة',
    c1: '#33270F', c2: '#191205', border: '#6B4226', bandA: '#6B4226', bandB: '#E8843C', diamond: '#D9A866',
  },
};

export function roleCardSVG(role) {
  const c = CARDS[role] || CARDS.villager;
  return `<svg ${VB} class="cardsvg">
    ${frame(role, c.c1, c.c2, c.border, c.bandA, c.bandB, c.diamond)}
    ${medallion(c.emoji, c.ring)}
    ${label(c.name, c.mission, c.nameColor)}
  </svg>`;
}

// face-down card back: crescent + repeating diamond lattice + wordmark
export function cardBackSVG() {
  let lattice = '';
  for (let r = 0; r < 6; r++) for (let q = 0; q < 5; q++) {
    const cx = 25 + q * 50, cy = 90 + r * 34;
    lattice += `<path d="M${cx} ${cy - 7} L${cx + 6} ${cy} L${cx} ${cy + 7} L${cx - 6} ${cy} Z" fill="none" stroke="#E8843C" stroke-width="1" opacity=".14"/>`;
  }
  return `<svg ${VB} class="cardsvg">
    <defs>
      <linearGradient id="g-back" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#141B2E"/><stop offset="1" stop-color="#0C111E"/>
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="244" height="344" rx="20" fill="url(#g-back)" stroke="#E8843C" stroke-width="3" stroke-opacity=".5"/>
    ${saduBand(16, false, '#A4262C', '#E8843C')}
    ${saduBand(321, true, '#A4262C', '#E8843C')}
    <g opacity=".9">${lattice}</g>
    <circle cx="125" cy="160" r="54" fill="none" stroke="#E8843C" stroke-width="1.5" opacity=".3"/>
    <text x="125" y="162" font-size="58" text-anchor="middle" dominant-baseline="central">🌙</text>
    <text x="125" y="250" font-family="Marhey, sans-serif" font-weight="700" font-size="26"
          text-anchor="middle" fill="#F2E9DC" opacity=".92">ذيب الديرة</text>
    <text x="125" y="276" font-family="IBM Plex Sans Arabic, sans-serif" font-size="12"
          text-anchor="middle" fill="#E8843C" opacity=".7">اضغط تكشف دورك</text>
  </svg>`;
}
