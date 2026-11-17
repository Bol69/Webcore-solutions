// Rend video.html image par image -> MP4 1080x1920 30 i/s
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const FPS = 30, DUR = +(process.argv[2] || 40), OUT = process.argv[3] || path.join(__dirname, 'page-produit.mp4');
const ONLY = process.argv[4]; // ex "2,10,20" -> captures fixes
// WARP=warp.json : temps de la voix -> temps de l'animation (linéaire par morceaux)
const K = process.env.WARP ? JSON.parse(require('fs').readFileSync(process.env.WARP, 'utf8')) : null;
const warp = t => { if (!K) return t; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [a, b] = K[i - 1], [c, d] = K[i]; return b + (d - b) * (t - a) / (c - a); } return K[K.length - 1][1]; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto('file://' + path.join(__dirname, 'video.html'));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
  if (ONLY) {
    for (const t of ONLY.split(',')) { await p.evaluate(x => seek(x), +t); await p.screenshot({ path: path.join(__dirname, `f_${t}.png`) }); }
    await b.close(); return;
  }
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', OUT]);
  for (let i = 0; i < FPS * DUR; i++) {
    await p.evaluate(x => seek(x), warp(i / FPS));
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log('frame', i);
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close(); console.log('done', OUT);
})();
