// Générateur du personnage vert foncé (SVG) + planche de poses
const fs = require('fs');
const path = require('path');
const OUT = __dirname;

const C = {
  body: '#1F5A3D',      // vert foncé
  bodyLight: '#2E7A55',
  line: '#141414',
  cap: '#F4A340',       // casquette orange
  capDark: '#D9822B',
  white: '#FFFFFF',
  bg: '#F3ECDD',
};

// trait "contouré" : noir épais dessous, vert dessus
function limb(pts, w) {
  const d = 'M' + pts.map(p => p.join(' ')).join(' L');
  return `<path d="${d}" fill="none" stroke="${C.line}" stroke-width="${w + 7}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${C.body}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function hand([x, y]) {
  return `<circle cx="${x}" cy="${y}" r="13" fill="${C.body}" stroke="${C.line}" stroke-width="3.5"/>`;
}
function foot([x, y], dir = 1) {
  return `<ellipse cx="${x + 8 * dir}" cy="${y + 4}" rx="22" ry="11" fill="${C.body}" stroke="${C.line}" stroke-width="3.5"/>`;
}

function face(expr, look = 0) {
  // yeux + bouche selon l'expression
  const ex = look * 4;
  let eyes = `
    <ellipse cx="${134}" cy="92" rx="9" ry="11" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
    <ellipse cx="${166}" cy="92" rx="9" ry="11" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
    <circle cx="${135 + ex}" cy="${94 + (expr === 'think' ? -4 : 0)}" r="4.5" fill="${C.line}"/>
    <circle cx="${167 + ex}" cy="${94 + (expr === 'think' ? -4 : 0)}" r="4.5" fill="${C.line}"/>`;
  if (expr === 'wink') {
    eyes = `
    <ellipse cx="134" cy="92" rx="9" ry="11" fill="${C.white}" stroke="${C.line}" stroke-width="3"/>
    <circle cx="135" cy="94" r="4.5" fill="${C.line}"/>
    <path d="M157 94 Q166 86 175 94" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`;
  }
  const mouths = {
    happy: `<path d="M136 112 Q150 126 164 112" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`,
    big: `<path d="M134 110 Q150 134 166 110 Z" fill="${C.line}" stroke="${C.line}" stroke-width="3" stroke-linejoin="round"/><path d="M142 120 Q150 126 158 120" fill="#E8656A" />`,
    wow: `<ellipse cx="150" cy="116" rx="7" ry="9" fill="${C.line}"/>`,
    think: `<path d="M140 116 L160 113" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`,
    wink: `<path d="M136 112 Q150 124 164 112" fill="none" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`,
  };
  const brows = expr === 'wow'
    ? `<path d="M126 80 L141 77 M159 77 L174 80" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`
    : expr === 'think'
      ? `<path d="M126 77 L141 75 M159 73 L174 77" stroke="${C.line}" stroke-width="3.5" stroke-linecap="round"/>`
      : '';
  return eyes + brows + (mouths[expr] || mouths.happy);
}

function head(expr, look) {
  return `
  <rect x="140" y="124" width="20" height="22" fill="${C.body}" stroke="${C.line}" stroke-width="3.5"/>
  <circle cx="150" cy="96" r="44" fill="${C.body}" stroke="${C.line}" stroke-width="4"/>
  <!-- reflet -->
  <path d="M118 80 Q122 66 134 60" fill="none" stroke="${C.bodyLight}" stroke-width="5" stroke-linecap="round"/>
  <!-- casquette -->
  <path d="M106 80 Q110 42 150 40 Q190 42 194 80 Z" fill="${C.cap}" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M184 76 Q214 72 228 82 Q212 90 186 86 Z" fill="${C.capDark}" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M150 41 L150 78" stroke="${C.capDark}" stroke-width="3"/>
  <circle cx="150" cy="40" r="5" fill="${C.capDark}" stroke="${C.line}" stroke-width="3"/>
  <!-- logo colis sur la casquette -->
  <rect x="122" y="54" width="18" height="15" rx="2" fill="${C.white}" stroke="${C.line}" stroke-width="2.5"/>
  <path d="M122 60 L140 60 M131 54 L131 60" stroke="${C.line}" stroke-width="2"/>
  ${face(expr, look)}`;
}

function torso() {
  return `<path d="M118 146 Q150 136 182 146 L176 278 Q150 288 124 278 Z" fill="${C.body}" stroke="${C.line}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M128 160 L128 230" stroke="${C.bodyLight}" stroke-width="5" stroke-linecap="round"/>`;
}

const SH_L = [122, 158], SH_R = [178, 158], HIP_L = [136, 272], HIP_R = [164, 272];

const POSES = {
  neutre: {
    label: 'Neutre', expr: 'happy',
    armL: [SH_L, [104, 214], [98, 266]], armR: [SH_R, [196, 214], [202, 266]],
    legL: [HIP_L, [132, 340], [128, 404]], legR: [HIP_R, [168, 340], [172, 404]],
  },
  montre: {
    label: 'Il montre', expr: 'happy', look: 1,
    armL: [SH_L, [104, 214], [100, 264]], armR: [SH_R, [228, 168], [272, 160]],
    legL: [HIP_L, [130, 340], [124, 404]], legR: [HIP_R, [172, 340], [178, 404]],
    extra: `<path d="M276 160 L294 156" stroke="${C.line}" stroke-width="5" stroke-linecap="round"/>`,
  },
  victoire: {
    label: 'Victoire', expr: 'big',
    armL: [SH_L, [92, 110], [82, 58]], armR: [SH_R, [208, 110], [218, 58]],
    legL: [HIP_L, [118, 336], [104, 400]], legR: [HIP_R, [182, 336], [196, 400]],
  },
  reflechit: {
    label: 'Il réfléchit', expr: 'think', look: 1,
    armL: [SH_L, [104, 214], [100, 264]], armR: [SH_R, [206, 200], [166, 132]],
    legL: [HIP_L, [132, 340], [128, 404]], legR: [HIP_R, [168, 340], [172, 404]],
    extra: `<text x="226" y="62" font-family="Kalam, cursive" font-weight="700" font-size="44" fill="${C.body}">?</text>
            <text x="254" y="40" font-family="Kalam, cursive" font-weight="700" font-size="30" fill="${C.cap}">?</text>`,
  },
  colis: {
    label: 'Il tient un colis', expr: 'wink',
    armL: [SH_L, [112, 212], [124, 236]], armR: [SH_R, [188, 212], [176, 236]],
    legL: [HIP_L, [132, 340], [128, 404]], legR: [HIP_R, [168, 340], [172, 404]],
    front: `<g transform="translate(150 222)">
      <rect x="-46" y="-30" width="92" height="66" rx="4" fill="#D9A86C" stroke="${C.line}" stroke-width="4"/>
      <path d="M-46 -8 L46 -8 M-12 -30 L-12 -8 M12 -30 L12 -8" stroke="${C.line}" stroke-width="3"/>
      <rect x="-12" y="-30" width="24" height="22" fill="${C.cap}" stroke="${C.line}" stroke-width="3"/>
      <text x="0" y="22" text-anchor="middle" font-family="Kalam, cursive" font-weight="700" font-size="16" fill="${C.line}">COLIS</text>
    </g>`,
    handsOnTop: [[106, 236], [194, 236]],
  },
  surpris: {
    label: 'Surpris', expr: 'wow',
    armL: [SH_L, [94, 186], [78, 140]], armR: [SH_R, [206, 186], [222, 140]],
    legL: [HIP_L, [130, 340], [124, 404]], legR: [HIP_R, [170, 340], [176, 404]],
    extra: `<path d="M64 110 L52 96 M74 100 L70 82 M236 110 L248 96 M226 100 L230 82" stroke="${C.cap}" stroke-width="5" stroke-linecap="round"/>`,
  },
  marche: {
    label: 'Il marche', expr: 'happy', look: 1,
    armL: [SH_L, [100, 210], [80, 250]], armR: [SH_R, [204, 210], [222, 252]],
    legL: [HIP_L, [112, 334], [86, 396]], legR: [HIP_R, [182, 330], [196, 398]],
    footDir: [-1, 1],
  },
  salut: {
    label: 'Salut !', expr: 'happy',
    armL: [SH_L, [104, 214], [98, 266]], armR: [SH_R, [222, 130], [236, 78]],
    legL: [HIP_L, [132, 340], [128, 404]], legR: [HIP_R, [168, 340], [172, 404]],
    extra: `<path d="M256 62 Q266 76 256 92 M268 54 Q282 76 268 100" fill="none" stroke="${C.cap}" stroke-width="4" stroke-linecap="round"/>`,
  },
};

function character(key) {
  const p = POSES[key];
  const fd = p.footDir || [-1, 1];
  const hands = p.handsOnTop ? '' : hand(p.armL[2]) + hand(p.armR[2]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 430" width="300" height="430">
  ${limb(p.legL, 26)}${limb(p.legR, 26)}
  ${foot(p.legL[2], fd[0])}${foot(p.legR[2], fd[1])}
  ${torso()}
  ${head(p.expr, p.look || 0)}
  ${limb(p.armL, 20)}${limb(p.armR, 20)}
  ${hands}
  ${p.front || ''}
  ${p.handsOnTop ? p.handsOnTop.map(hand).join('') : ''}
  ${p.extra || ''}
</svg>`;
}

fs.mkdirSync(path.join(OUT, 'poses'), { recursive: true });
for (const k of Object.keys(POSES)) fs.writeFileSync(path.join(OUT, 'poses', k + '.svg'), character(k));

const cards = Object.keys(POSES).map(k => `
  <div class="card"><div class="fig">${character(k)}</div><div class="lab">${POSES[k].label}</div></div>`).join('');

fs.writeFileSync(path.join(OUT, 'sheet.html'), `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:${C.bg};font-family:Kalam,cursive;color:#141414}
.wrap{width:1400px;padding:48px 56px}
h1{font-size:64px;margin:0;line-height:1}
h1 .hl{background:#141414;color:${C.bg};padding:0 12px}
.sub{font-size:26px;margin:12px 0 30px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:26px}
.card{background:#fff;border:3px solid #141414;border-radius:14px;box-shadow:6px 6px 0 #141414;padding:14px 10px 6px;text-align:center}
.fig svg{width:100%;height:auto;max-height:330px}
.lab{font-size:28px;font-weight:700}
.pal{display:flex;gap:18px;margin-top:34px;align-items:center;font-size:22px}
.sw{width:44px;height:44px;border-radius:50%;border:3px solid #141414;display:inline-block;vertical-align:middle;margin-right:6px}
</style></head><body><div class="wrap">
<h1>Ton <span class="hl">personnage</span> e-com</h1>
<div class="sub">Bonhomme vert foncé, casquette orange avec logo colis. Planche de 8 poses.</div>
<div class="grid">${cards}</div>
<div class="pal">Palette :
 <span><span class="sw" style="background:${C.body}"></span>Vert ${C.body}</span>
 <span><span class="sw" style="background:${C.cap}"></span>Orange ${C.cap}</span>
 <span><span class="sw" style="background:${C.bg}"></span>Crème ${C.bg}</span>
 <span><span class="sw" style="background:#141414"></span>Noir #141414</span>
 <span><span class="sw" style="background:#D9A86C"></span>Carton #D9A86C</span>
</div></div></body></html>`);
console.log('ok');
