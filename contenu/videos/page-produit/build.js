// Construit video.html (animation pilotée par seek(t)) à partir des poses SVG
const fs = require('fs');
const path = require('path');
const POSES = path.join(__dirname, '../../personnage/');
const poses = {};
for (const f of fs.readdirSync(POSES).filter(f => f.endsWith('.svg'))) poses[f.replace('.svg', '')] = fs.readFileSync(POSES + f, 'utf8');

const hl = s => s.replace(/\*(.+?)\*/g, '<span class="hl">$1</span>');

const TOTAL = 40;
const STEPS = [ // [début, fin] de chaque point
  [8, 12], [12, 16], [16, 20], [20, 24], [24, 27.5], [27.5, 31],
];
const TITLES = [
  [-1, 4.5, 'Des visites…<br>mais *0 vente* ?'],
  [4.5, 8, '*6 points* qui font<br>acheter'],
  [8, 12, '1. Des *vraies* photos'],
  [12, 16, '2. Un titre *bénéfice*'],
  [16, 20, '3. Prix + *urgence*'],
  [20, 24, '4. La *preuve* des clients'],
  [24, 27.5, '5. Un bouton *visible*'],
  [27.5, 31, '6. Zéro *doute*'],
  [31, 35, 'Ta page est *prête*.'],
  [35, 40, 'Tu veux la<br>*checklist* ?'],
];
const SUBS = [
  [0.3, 4.5, 'Ta page produit a des *visites*… mais zéro *vente* ?'],
  [4.5, 8, 'Souvent, le problème c\'est la *page*. Voici ce qui fait *acheter*.'],
  [8, 12, 'Montre le produit *utilisé*, sa *taille*, ses détails.'],
  [12, 16, 'Vends le *résultat*, pas la fiche technique.'],
  [16, 20, 'Un prix clair + une raison d\'acheter *maintenant*.'],
  [20, 24, 'Des *avis clients*, avec photos si possible.'],
  [24, 27.5, 'Le bouton se voit *tout de suite*. Sans chercher.'],
  [27.5, 31, 'On *rassure* : livraison, retour, paiement.'],
  [31, 35, 'Une page qui *rassure*, c\'est une page qui *vend*.'],
  [35, 40, 'Commente *PAGE* et je t\'envoie ma checklist.'],
];
const POSE_AT = [
  [0, 'surpris'], [4.5, 'montre'], [8, 'montre'], [12, 'reflechit'], [16, 'montre'],
  [20, 'colis'], [24, 'montre'], [27.5, 'neutre'], [31, 'victoire'], [35, 'salut'],
];

const bottle = `<svg viewBox="0 0 80 160" width="58" height="116">
  <rect x="26" y="4" width="28" height="18" rx="4" fill="#141414"/>
  <rect x="22" y="20" width="36" height="10" rx="3" fill="#F4A340" stroke="#141414" stroke-width="3"/>
  <path d="M18 34 Q18 28 26 28 L54 28 Q62 28 62 34 L64 148 Q64 156 56 156 L24 156 Q16 156 16 148 Z" fill="#2E7A55" stroke="#141414" stroke-width="4"/>
  <path d="M26 44 L26 136" stroke="#5FA27E" stroke-width="5" stroke-linecap="round"/>
  <circle cx="40" cy="92" r="11" fill="#F3ECDD" stroke="#141414" stroke-width="3"/>
</svg>`;
// sous-titres mot par mot : chaque mot dans un <span class="w">, les *mots* surlignés
function words(s) {
  let inHl = false;
  return s.split(' ').map(tok => {
    const start = tok.startsWith('*'); if (start) { inHl = true; tok = tok.slice(1); }
    const endIdx = tok.indexOf('*'); let end = false;
    if (endIdx >= 0) { end = true; tok = tok.replace('*', ''); }
    const out = `<span class="w${inHl ? ' hl' : ''}">${tok}</span>`;
    if (end) inHl = false;
    return out;
  }).join(' ');
}
const small = (w, h) => bottle.replace('width="58" height="116"', `width="${w}" height="${h}"`);

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#F3ECDD;width:540px;height:960px;overflow:hidden}
#stage{position:relative;width:540px;height:960px;overflow:hidden;background:#F3ECDD;
  background-image:radial-gradient(#E2D7C1 1.4px,transparent 1.4px);background-size:22px 22px;font-family:Kalam,cursive;color:#141414}
.a{position:absolute;opacity:0;will-change:transform,opacity}
.hl{background:#141414;color:#F3ECDD;padding:0 7px;border-radius:3px}
.title{left:26px;right:26px;top:58px;font-size:42px;font-weight:700;line-height:1.18}
.sub{left:22px;right:22px;top:846px;background:#fff;border:3px solid #141414;border-radius:14px;box-shadow:5px 5px 0 #141414;
  padding:10px 16px;font-size:25px;font-weight:700;line-height:1.25;text-align:center}
.sub .hl{background:#F4A340;color:#141414}
#char{position:absolute;width:210px;top:520px}
#char svg{width:100%;height:auto;display:block}
/* téléphone */
#phone{left:218px;top:212px;width:296px;height:600px;background:#fff;border:4px solid #141414;border-radius:36px;
  box-shadow:7px 7px 0 #141414;padding:34px 13px 12px;font-family:Inter,sans-serif}
#phone .notch{position:absolute;top:10px;left:50%;width:84px;height:14px;margin-left:-42px;background:#141414;border-radius:8px}
.sec{position:relative;margin-bottom:9px;opacity:0;border-radius:10px}
.sec.hot::after{content:"";position:absolute;inset:-6px;border:3px dashed #F4A340;border-radius:12px}
.ph{height:132px;background:#EFE6D3;border:2px solid #141414;border-radius:10px;display:flex;align-items:center;justify-content:center;position:relative}
.ph .tag{position:absolute;left:8px;top:8px;background:#F4A340;border:2px solid #141414;border-radius:6px;font-size:10px;font-weight:800;padding:1px 6px}
.thumbs{display:flex;gap:6px;margin-top:6px}
.th{flex:1;height:44px;background:#EFE6D3;border:2px solid #141414;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;gap:2px}
.old{font-size:12px;color:#8a8478;text-decoration:line-through;text-decoration-thickness:2px;text-decoration-color:#E8656A}
.new{font-size:17px;font-weight:800;line-height:1.2;margin-top:2px}
.price{display:flex;align-items:baseline;gap:8px}
.price b{font-size:26px;font-weight:800}
.price s{color:#8a8478;font-size:15px}
.badge{background:#E8656A;color:#fff;border:2px solid #141414;border-radius:6px;font-size:12px;font-weight:800;padding:1px 6px}
.ship{font-size:12px;font-weight:700;color:#1F5A3D;margin-top:2px}
.stars{color:#F4A340;font-size:17px;letter-spacing:1px}
.stars span{color:#141414;font-size:12px;font-weight:700;letter-spacing:0;margin-left:4px}
.rev{display:flex;gap:7px;align-items:center;background:#F7F2E7;border:2px solid #141414;border-radius:8px;padding:5px;margin-top:4px;font-size:11px;font-weight:600;line-height:1.25}
.rev .pic{width:34px;height:34px;border-radius:6px;background:#EFE6D3;border:2px solid #141414;flex:none;display:flex;align-items:center;justify-content:center}
.btn{background:#F4A340;border:3px solid #141414;border-radius:12px;box-shadow:3px 3px 0 #141414;text-align:center;font-weight:800;font-size:17px;padding:9px 0}
.trust{display:flex;gap:5px}
.tr{flex:1;border:2px solid #141414;border-radius:8px;background:#fff;font-size:9.5px;font-weight:700;text-align:center;padding:5px 2px;line-height:1.2}
.tr i{display:block;margin:0 auto 3px;width:18px;height:18px;border-radius:50%;background:#1F5A3D;color:#fff;font-style:normal;font-size:12px;line-height:18px}
/* hook */
.stat{top:250px;width:220px;background:#fff;border:3px solid #141414;border-radius:16px;box-shadow:6px 6px 0 #141414;text-align:center;padding:12px 0 8px}
.stat .n{font-family:Inter,sans-serif;font-weight:800;font-size:46px}
.stat .l{font-size:24px;font-weight:700}
/* cta */
.cta{left:40px;right:40px;top:230px;background:#fff;border:3px solid #141414;border-radius:20px;box-shadow:7px 7px 0 #141414;text-align:center;padding:22px 10px}
.cta .big{font-family:Inter,sans-serif;font-weight:800;font-size:40px}
.pill{display:inline-block;margin:12px 0;background:#F4A340;border:3px solid #141414;border-radius:40px;padding:6px 26px;font-family:Inter,sans-serif;font-weight:800;font-size:38px}
.cta .s{font-size:24px;font-weight:700}
.w{opacity:0;display:inline-block;transition:none}
#prog{position:absolute;top:22px;left:0;right:0;display:flex;justify-content:center;gap:8px;opacity:0}
#prog span{width:30px;height:30px;border-radius:50%;border:3px solid #141414;background:#fff;font:800 14px/24px Inter,sans-serif;text-align:center}
#prog span.on{background:#1F5A3D;color:#fff}
#prog span.cur{background:#F4A340;color:#141414;transform:scale(1.18)}
.cbox{left:222px;top:600px;width:300px;background:#fff;border:3px solid #141414;border-radius:30px;box-shadow:5px 5px 0 #141414;display:flex;align-items:center;gap:10px;padding:9px 10px;font-family:Inter,sans-serif}
.cbox .av{width:34px;height:34px;border-radius:50%;background:#1F5A3D;border:2px solid #141414;flex:none}
.cbox .tx{flex:1;font-weight:800;font-size:22px;letter-spacing:1px;white-space:nowrap}
.cbox .tx .ph{color:#aaa;font-weight:500;font-size:15px;letter-spacing:0}
.cbox .go{width:36px;height:36px;border-radius:50%;background:#F4A340;border:2px solid #141414;color:#141414;font-weight:800;font-size:18px;line-height:32px;text-align:center;flex:none}
.cur-bar{display:inline-block;width:3px;height:22px;background:#141414;vertical-align:middle;margin-left:2px}
.arrow{left:350px;top:520px;font:800 56px/1 Inter,sans-serif;color:#F4A340;-webkit-text-stroke:3px #141414}
.check{position:absolute;right:-14px;top:-10px;width:26px;height:26px;border-radius:50%;background:#1F5A3D;color:#fff;border:2px solid #141414;font:800 14px/22px Inter,sans-serif;text-align:center;opacity:0}
</style></head><body><div id="stage">

${TITLES.map((x, i) => `<div class="a title" id="t${i}" data-f="${x[0]}" data-t="${x[1]}" data-an="up">${hl(x[2])}</div>`).join('')}

<div id="prog">${[1, 2, 3, 4, 5, 6].map(n => `<span>${n}</span>`).join('')}</div>
<div class="a stat" id="s1" style="left:30px" data-f="0.3" data-t="4.3" data-an="pop"><div class="n" id="cnt">0</div><div class="l">visites</div></div>
<div class="a stat" id="s2" style="left:290px" data-f="0.9" data-t="4.3" data-an="pop"><div class="n" style="color:#E8656A">0</div><div class="l">ventes</div></div>

<div class="a" id="phone" data-f="5" data-t="35" data-an="right"><div class="notch"></div>
  <div class="sec" id="p1"><div class="ph"><span class="tag">EN VRAI</span>${bottle}</div>
    <div class="thumbs"><div class="th">${small(14, 28)}taille</div><div class="th">${small(14, 28)}détail</div><div class="th">${small(14, 28)}dehors</div></div><div class="check">✓</div></div>
  <div class="sec" id="p2"><div class="old" id="p2o">Gourde inox 750 ml double paroi</div><div class="new" id="p2n" style="opacity:0">Ta boisson fraîche 24 h, même en plein soleil</div><div class="check">✓</div></div>
  <div class="sec" id="p3"><div class="price"><b>29 €</b><s>45 €</s><span class="badge">-35 %</span></div><div class="ship" id="p3b" style="opacity:0">⚡ Livraison offerte jusqu'à minuit</div><div class="check">✓</div></div>
  <div class="sec" id="p4"><div class="stars">★★★★★<span>4,8 · 312 avis</span></div>
    <div class="rev"><div class="pic">${small(10, 20)}</div><div>« Encore froide après ma journée au parc ! »<br><b>Inès, achat vérifié</b></div></div><div class="check">✓</div></div>
  <div class="sec" id="p5"><div class="btn" id="btn">Ajouter au panier</div><div class="check">✓</div></div>
  <div class="sec" id="p6"><div class="trust"><div class="tr"><i>✓</i>Livraison<br>48 h</div><div class="tr"><i>✓</i>Retour<br>30 jours</div><div class="tr"><i>✓</i>Paiement<br>sécurisé</div></div><div class="check">✓</div></div>
</div>

<div class="a cta" id="cta" data-f="35.3" data-t="40.5" data-an="pop"><div class="big">Commente</div><div class="pill">« PAGE »</div><div class="s">et je t'envoie ma checklist<br>en message privé</div></div>

<div class="a arrow" id="arr" data-f="36" data-t="40.5" data-an="fade">↓</div>
<div class="a cbox" id="cbox" data-f="35.8" data-t="40.5" data-an="up"><div class="av"></div><div class="tx" id="ctx"></div><div class="go">↑</div></div>

<div id="char"></div>

${SUBS.map((x, i) => `<div class="a sub" id="u${i}" data-f="${x[0]}" data-t="${x[1]}" data-an="fade">${words(x[2])}</div>`).join('')}
</div>
<script>
const POSES=${JSON.stringify(poses)};
const POSE_AT=${JSON.stringify(POSE_AT)};
const STEPS=${JSON.stringify(STEPS)};
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const eo=x=>1-Math.pow(1-x,3);
const eb=x=>{const c=1.70158,d=c+1;return 1+d*Math.pow(x-1,3)+c*Math.pow(x-1,2)};
const lerp=(a,b,x)=>a+(b-a)*x;
const items=[...document.querySelectorAll('.a[data-f]')].map(el=>({el,f:+el.dataset.f,t:+el.dataset.t,an:el.dataset.an}));
function anim(el,an,p,q){
  const e=an==='pop'?eb(p):eo(p), o=Math.min(cl(p*1.6),q);
  let tr='';
  if(an==='up')tr='translateY('+((1-e)*36)+'px)';
  if(an==='right')tr='translateX('+((1-e)*340)+'px)';
  if(an==='pop')tr='scale('+(0.55+0.45*e)+')';
  if(an==='fade')tr='translateY('+((1-e)*12)+'px)';
  el.style.opacity=o; el.style.transform=tr;
}
let cur='';
const char=document.getElementById('char');
window.seek=function(t){
  for(const it of items){
    const p=cl((t-it.f)/0.45), q=it.t>=40?1:cl((it.t-t)/0.3);
    if(t<it.f||t>it.t){it.el.style.opacity=0;continue}
    anim(it.el,it.an,p,q);
  }
  // sections du téléphone
  STEPS.forEach((s,i)=>{
    const sec=document.getElementById('p'+(i+1));
    const p=cl((t-s[0]-0.25)/0.45);
    sec.style.opacity=t<s[0]?0:cl(p*1.5);
    sec.style.transform='scale('+(t<s[0]?0.6:0.6+0.4*eb(p))+')';
    sec.classList.toggle('hot',t>=s[0]&&t<s[1]);
    const ck=sec.querySelector('.check'), k=cl((t-31.2-i*0.18)/0.3);
    ck.style.opacity=k; ck.style.transform='scale('+(t<31.2?0:eb(k))+')';
  });
  // titre : ancien barré puis nouveau
  const k2=cl((t-13.3)/0.4); document.getElementById('p2n').style.opacity=k2;
  document.getElementById('p2n').style.transform='translateY('+((1-eo(k2))*8)+'px)';
  document.getElementById('p3b').style.opacity=cl((t-17.6)/0.4);
  // bouton qui pulse
  const b=document.getElementById('btn');
  b.style.transform=(t>24.4&&t<31)?'scale('+(1+0.06*Math.max(0,Math.sin((t-24.4)*7)))+')':'none';
  // téléphone : petit zoom au récap
  const ph=document.getElementById('phone');
  if(t>31&&t<35){ph.style.transform='scale('+(1+0.03*Math.sin((t-31)*Math.PI/4))+')'}
  // sous-titres mot par mot
  document.querySelectorAll('.sub').forEach(su=>{
    const f=+su.dataset.f, t2=+su.dataset.t, ws=su.querySelectorAll('.w');
    const span=Math.min((t2-f)*0.75, ws.length*0.3);
    ws.forEach((w,i)=>{const k=cl((t-f-(i/ws.length)*span)/0.12); w.style.opacity=k; w.style.transform='translateY('+((1-k)*6)+'px)'});
  });
  // compteur de visites + carte "0 vente" qui tremble
  document.getElementById('cnt').textContent=Math.round(1240*eo(cl((t-0.4)/1.6))).toLocaleString('fr-FR');
  const s2=document.getElementById('s2');
  if(t>2.2&&t<2.8){s2.style.transform+=' translateX('+(Math.sin((t-2.2)*60)*7*(1-(t-2.2)/0.6))+'px) rotate('+(Math.sin((t-2.2)*50)*2)+'deg)';s2.style.boxShadow='6px 6px 0 #E8656A'}
  else s2.style.boxShadow='';
  // progression 1 → 6
  const pr=document.getElementById('prog');
  pr.style.opacity=(t>=7.6&&t<31.2)?cl(Math.min((t-7.6)/0.4,(31.2-t)/0.3)):0;
  [...pr.children].forEach((d,i)=>{d.className=t>=STEPS[i][1]?'on':(t>=STEPS[i][0]?'cur':'')});
  // case de commentaire : PAGE tapé lettre par lettre
  const word='PAGE', nL=Math.max(0,Math.min(4,Math.floor((t-36.3)/0.22)+1));
  document.getElementById('ctx').innerHTML=t<36.3?'<span class="ph">Ajoute un commentaire…</span><span class="cur-bar"></span>':word.slice(0,nL)+(t<37.4?'<span class="cur-bar"></span>':' ✓');
  const ar=document.getElementById('arr'); if(t>36)ar.style.transform='translateY('+(Math.abs(Math.sin((t-36)*5))*-14)+'px)';
  // personnage
  let pose='neutre',since=0;
  for(const [s,n] of POSE_AT){if(t>=s){pose=n;since=s}}
  if(pose!==cur){char.innerHTML=POSES[pose];cur=pose}
  let x=165;
  if(t>=4.2)x=lerp(165,4,eo(cl((t-4.2)/0.6)));
  const top=t<4.5?470:lerp(470,540,eo(cl((t-4.2)/0.6)));
  const pp=cl((t-since)/0.35), sq=t<since+0.35?(1+0.1*Math.sin(pp*Math.PI)):1;
  const bob=Math.sin(t*3.2)*4;
  const enter=t<0.05?1:eb(cl(t/0.5));
  char.style.left=x+'px'; char.style.top=top+'px';
  char.style.transform='translateY('+(bob+(1-enter)*300)+'px) scale('+sq+','+(2-sq)+')';
  char.style.transformOrigin='50% 100%';
};
seek(0);
</script></body></html>`;
fs.writeFileSync(process.argv[2] || path.join(__dirname, 'video.html'), html);
console.log('ok');
