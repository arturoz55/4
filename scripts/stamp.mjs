// Writes a content hash into index.html's links to style.css and main.js (style.css?v=abc123),
// so any static host serves fresh files after each change. Run: npm run stamp
import fs from 'node:fs';
import crypto from 'node:crypto';
const root = new URL('../', import.meta.url);
let html = fs.readFileSync(new URL('index.html', root), 'utf8');
for (const f of ['style.css', 'main.js']) {
  const v = crypto.createHash('sha256').update(fs.readFileSync(new URL(f, root))).digest('hex').slice(0, 10);
  html = html.replace(new RegExp(`"${f.replace('.', '\\.')}(\\?v=[a-f0-9]*)?"`, 'g'), `"${f}?v=${v}"`);
  console.log(`${f} -> v=${v}`);
}
fs.writeFileSync(new URL('index.html', root), html);
