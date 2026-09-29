import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from './config.js';
import { initDb } from './db.js';
import routes from './routes.js';
import { startIndexer } from './indexer.js';
import { startReelWorker } from './reels.js';

await initDb();
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true, bodyLimit: 1024 * 1024 });
await app.register(cookie);
// Keep the raw JSON body so webhook signatures can be checked.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
  req.rawBody = body;
  if (!body) return done(null, {});
  try { done(null, JSON.parse(body)); } catch (e) { e.statusCode = 400; done(e); }
});
app.setErrorHandler((err, req, reply) => {
  const code = err.statusCode && err.statusCode < 600 ? err.statusCode : 500;
  if (code >= 500) req.log.error(err);
  reply.code(code).send({ error: code >= 500 ? 'Something went wrong on the server.' : err.message });
});
app.addHook('onSend', async (req, reply, payload) => {
  reply.header('x-content-type-options', 'nosniff').header('referrer-policy', 'strict-origin-when-cross-origin');
  return payload;
});
await app.register(routes);

// ---- the site: only these files are public. Asset URLs carry a content hash so every deploy busts caches.
const ROOT = new URL('../', import.meta.url);
const FILES = { 'style.css': 'text/css; charset=utf-8', 'main.js': 'text/javascript; charset=utf-8', 'live.js': 'text/javascript; charset=utf-8' };
const assets = {};
for (const [f, type] of Object.entries(FILES)) {
  const body = fs.readFileSync(new URL(f, ROOT));
  assets[f] = { body, type, v: crypto.createHash('sha256').update(body).digest('hex').slice(0, 10) };
}
let html = fs.readFileSync(new URL('index.html', ROOT), 'utf8');
for (const f of Object.keys(assets)) html = html.replaceAll(`"${f}"`, `"/${f}?v=${assets[f].v}"`);
app.get('/', (req, reply) => reply.header('cache-control', 'no-cache').type('text/html; charset=utf-8').send(html));
for (const f of Object.keys(assets)) {
  app.get('/' + f, (req, reply) => reply.header('cache-control', req.query.v ? 'public, max-age=31536000, immutable' : 'no-cache').type(assets[f].type).send(assets[f].body));
}

await app.listen({ port: config.port, host: config.host });
console.log(`Hyperpad on ${config.publicUrl} · ${config.chain.name} (${config.chain.id}) · launchpad ${config.launchpad || 'not set'}`);
startIndexer();
startReelWorker();
