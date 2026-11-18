// Rend une page HTML animée (fonction seek(t)) image par image -> MP4 1080x1920, 30 i/s
// node render.js <video.html> <durée_s> <sortie.mp4> [warp.json] [captures "2,10,20"]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const [HTML, DUR_S, OUT, WARP, ONLY] = process.argv.slice(2);
const FPS = 30, DUR = +DUR_S;
const K = WARP && WARP !== '-' ? JSON.parse(fs.readFileSync(WARP, 'utf8')) : null;
// temps de la voix -> temps de l'animation (linéaire par morceaux)
const warp = t => { if (!K) return t; for (let i = 1; i < K.length; i++) if (t <= K[i][0]) { const [a, b] = K[i - 1], [c, d] = K[i]; return b + (d - b) * (t - a) / (c - a); } return K[K.length - 1][1]; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto('file://' + require('path').resolve(HTML));
  await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(800);
  if (ONLY) {
    for (const t of ONLY.split(',')) { await p.evaluate(x => seek(x), warp(+t)); await p.screenshot({ path: OUT.replace(/\.mp4$/, '') + `_${t}.png` }); }
    await b.close(); return;
  }
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', OUT]);
  for (let i = 0; i < FPS * DUR; i++) {
    await p.evaluate(x => seek(x), warp(i / FPS));
    const buf = await p.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r)); await b.close();
})();
