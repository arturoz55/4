// Renders marketing/tools/video.html frame by frame, then encodes marketing/hyperpad-launch.mp4.
// Usage: node marketing/tools/render-video.js <framesDir> <ffmpegPath>
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const [framesDir, ffmpeg] = process.argv.slice(2);
const FPS = 30;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 }, ignoreHTTPSErrors: true });
  await p.goto('file://' + path.resolve(__dirname, 'video.html'));
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(800);
  const dur = await p.evaluate(() => window.DUR);
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    const url = await p.evaluate(t => window.renderAt(t), i / FPS);
    fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(4, '0')}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
  }
  await b.close();
  const out = path.resolve(__dirname, '..', 'hyperpad-launch.mp4');
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(framesDir, 'f%04d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', out]);
  console.log('frames', n, '->', out, fs.statSync(out).size, 'bytes');
})();
