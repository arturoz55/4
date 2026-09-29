import crypto from 'node:crypto';
import { formatEther, parseEther, isAddress } from 'viem';
import { config } from './config.js';
import { q, one } from './db.js';
import { client, abi } from './chain.js';
import { subscribe } from './events.js';
import { ethUsd } from './price.js';
import { newNonce, messageFor, verifySignIn, sessionToken, readSession } from './auth.js';
import { verifyCallback, completeReel } from './reels.js';

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// Same format check as the site: prefix, alphabet and length. Checksums are not verified.
export function checkZec(raw) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const low = v.toLowerCase();
  if (new RegExp(`^u1[${B32}]{100,}$`).test(low)) return low;
  if (new RegExp(`^zs1[${B32}]{75}$`).test(low)) return low;
  if (new RegExp(`^t[13][${B58}]{33}$`).test(v)) return v;
  throw Object.assign(new Error('That is not a Zcash address (u1, zs1, t1 or t3).'), { statusCode: 400 });
}

const wei = v => BigInt(String(v).split('.')[0] || '0');
function coinJson(r) {
  const ve = wei(r.virtual_eth), vt = wei(r.virtual_tokens);
  return {
    address: r.address, creator: r.creator, name: r.name, symbol: r.symbol, line: r.line,
    image: r.image_id ? `/api/img/${r.image_id}` : null, zecAddr: r.zec_addr, tipsOff: r.tips_off,
    reels: r.reels, feesUsd: Number(r.fees_usd), feesEth: formatEther(wei(r.fees_wei)), reelFundUsd: Number(r.reel_fund_usd),
    volumeEth: formatEther(wei(r.volume_wei)), priceEth: vt > 0n ? Number(ve) / Number(vt) : 0,
    tokensSold: formatEther(wei(r.tokens_sold)), graduated: r.graduated,
    createdAt: r.created_at, lastTradeAt: r.last_trade_at, lastReelAt: r.last_reel_at,
    tipsZec: Number(r.tips_zec || 0), tipsCount: Number(r.tips_count || 0)
  };
}
const COIN_SELECT = `SELECT c.*, COALESCE(t.z, 0) AS tips_zec, COALESCE(t.n, 0) AS tips_count FROM coins c
  LEFT JOIN (SELECT coin, SUM(zec) AS z, COUNT(*) AS n FROM tips GROUP BY coin) t ON t.coin = c.address`;

const hits = new Map();
function limit(ip, key, max, windowMs) {
  const k = ip + key, now = Date.now(), h = (hits.get(k) || []).filter(t => now - t < windowMs);
  h.push(now); hits.set(k, h);
  if (h.length > max) throw Object.assign(new Error('Too many requests. Wait a minute and try again.'), { statusCode: 429 });
}
const bad = msg => Object.assign(new Error(msg), { statusCode: 400 });
const addrParam = a => { if (!isAddress(a)) throw bad('Not a valid address.'); return a.toLowerCase(); };

export default async function routes(app) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/config', async () => ({
    chain: config.chain, launchpad: config.launchpad, reelCostUsd: config.reelCostUsd, feeBps: 100,
    split: { creator: 0.3, reels: 0.5, protocol: 0.2 }, videoProvider: config.videoProvider, ethUsd: await ethUsd()
  }));

  app.get('/api/stats', async () => {
    const r = await one(`SELECT COUNT(*) AS coins, COALESCE(SUM(reels),0) AS reels, COALESCE(SUM(fees_usd),0) AS fees FROM coins`);
    const t = await one('SELECT COALESCE(SUM(zec),0) AS zec FROM tips');
    return { coins: Number(r.coins), reels: Number(r.reels), paidUsd: Number(r.fees) * 0.3, zec: Number(t.zec) };
  });

  app.get('/api/coins', async req => {
    const sort = { recent: 'COALESCE(c.last_reel_at, c.created_at) DESC', reels: 'c.reels DESC, c.fees_usd DESC', fees: 'c.fees_usd DESC', new: 'c.created_at DESC' }[req.query.sort] || 'COALESCE(c.last_reel_at, c.created_at) DESC';
    const search = String(req.query.q || '').trim().replace(/^\$/, '').slice(0, 40);
    const creator = req.query.creator && isAddress(req.query.creator) ? req.query.creator.toLowerCase() : null;
    const params = [], where = [];
    if (search) { params.push(`%${search}%`); where.push(`(c.name ILIKE $${params.length} OR c.symbol ILIKE $${params.length})`); }
    if (creator) { params.push(creator); where.push(`c.creator = $${params.length}`); }
    const rows = await q(`${COIN_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${sort} LIMIT 60`, params);
    return rows.map(coinJson);
  });

  app.get('/api/coins/:address', async req => {
    const r = await one(`${COIN_SELECT} WHERE c.address = $1`, [addrParam(req.params.address)]);
    if (!r) throw Object.assign(new Error('Coin not found.'), { statusCode: 404 });
    return coinJson(r);
  });
  app.get('/api/coins/:address/trades', async req => (await q('SELECT * FROM trades WHERE coin = $1 ORDER BY ts DESC, log_index DESC LIMIT 25', [addrParam(req.params.address)]))
    .map(t => ({ tx: t.tx_hash, trader: t.trader, isBuy: t.is_buy, eth: formatEther(wei(t.eth_wei)), feeEth: formatEther(wei(t.fee_wei)), usd: Number(formatEther(wei(t.eth_wei))) * Number(t.eth_usd), ts: t.ts })));
  app.get('/api/coins/:address/history', async req => {
    const rows = await q('SELECT fee_wei, eth_usd, ts FROM trades WHERE coin = $1 ORDER BY ts, log_index', [addrParam(req.params.address)]);
    let acc = 0; return rows.map(r => { acc += Number(formatEther(wei(r.fee_wei))) * Number(r.eth_usd); return { ts: r.ts, feesUsd: acc }; }).slice(-60);
  });
  app.get('/api/coins/:address/reels', async req => q('SELECT id, n, format, host, status, video_url AS "videoUrl", created_at AS "createdAt", updated_at AS "updatedAt" FROM reels WHERE coin = $1 ORDER BY n DESC LIMIT 20', [addrParam(req.params.address)]));
  app.get('/api/coins/:address/tips', async req => q('SELECT zec, pool, verified, created_at AS "createdAt" FROM tips WHERE coin = $1 ORDER BY id DESC LIMIT 20', [addrParam(req.params.address)]));
  app.get('/api/reels', async () => q(`SELECT r.id, r.coin, r.n, r.format, r.host, r.status, r.video_url AS "videoUrl", r.updated_at AS "updatedAt", c.symbol, c.name, c.image_id
    FROM reels r JOIN coins c ON c.address = r.coin ORDER BY r.updated_at DESC LIMIT 12`));
  app.get('/api/tips', async () => (await q(`SELECT t.zec, t.pool, t.verified, t.created_at AS "createdAt", c.symbol, c.address AS coin FROM tips t JOIN coins c ON c.address = t.coin ORDER BY t.id DESC LIMIT 12`)));

  // Coin profile, uploaded before the on-chain launch. Its URL becomes the token's metadataURI.
  app.post('/api/meta', { bodyLimit: Math.ceil(config.maxImageBytes * 1.4) + 4096 }, async req => {
    limit(req.ip, 'meta', 20, 3600_000);
    const { name, symbol, line, image, zecAddr } = req.body || {};
    const n = String(name || '').trim().replace(/\s+/g, ' '), s = String(symbol || '').trim(), l = String(line || '').trim().replace(/\s+/g, ' ');
    if (n.length < 2 || n.length > 32) throw bad('Name must be 2 to 32 characters.');
    if (!/^[A-Z0-9]{2,8}$/.test(s)) throw bad('Ticker must be 2 to 8 capital letters or digits.');
    if (l.length < 8 || l.length > 80) throw bad('Pitch line must be 8 to 80 characters.');
    const zec = checkZec(zecAddr);
    let imageId = null;
    if (image) {
      const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
      if (!m) throw bad('Image must be a PNG, JPG or WebP.');
      const buf = Buffer.from(m[3], 'base64');
      if (buf.length > config.maxImageBytes) throw bad('Image is larger than 2 MB.');
      imageId = crypto.randomBytes(16).toString('hex');
      await q('INSERT INTO images (id, mime, data) VALUES ($1, $2, $3)', [imageId, m[1], buf]);
    }
    const id = crypto.randomBytes(16).toString('hex');
    await q('INSERT INTO meta (id, name, symbol, line, image_id, zec_addr) VALUES ($1,$2,$3,$4,$5,$6)', [id, n, s, l, imageId, zec]);
    return { id, metadataURI: `${config.publicUrl}/api/meta/${id}`, name: n, symbol: s };
  });
  app.get('/api/meta/:id', async (req, reply) => {
    const r = await one('SELECT * FROM meta WHERE id = $1', [String(req.params.id)]);
    if (!r) throw Object.assign(new Error('Not found.'), { statusCode: 404 });
    reply.header('cache-control', 'public, max-age=86400');
    return { name: r.name, symbol: r.symbol, description: r.line, image: r.image_id ? `${config.publicUrl}/api/img/${r.image_id}` : null };
  });
  app.get('/api/img/:id', async (req, reply) => {
    const r = await one('SELECT mime, data FROM images WHERE id = $1', [String(req.params.id)]);
    if (!r) throw Object.assign(new Error('Not found.'), { statusCode: 404 });
    reply.header('content-type', r.mime).header('cache-control', 'public, max-age=31536000, immutable');
    return Buffer.from(r.data);
  });

  // ZEC tips are reported by the tipper and shown as unverified. Checking them on chain needs the
  // coin owner's viewing key and a lightwalletd server (see DEPLOY.md). Memos are never stored.
  app.post('/api/tips', async req => {
    limit(req.ip, 'tip', 10, 60_000);
    const { coin, zec, pool, txid } = req.body || {};
    const c = await one('SELECT address, tips_off, zec_addr FROM coins WHERE address = $1', [addrParam(String(coin))]);
    if (!c) throw bad('Unknown coin.');
    if (c.tips_off || !c.zec_addr) throw bad('This coin is not taking ZEC tips.');
    const z = Number(zec);
    if (!(z >= 0.0001 && z <= 100)) throw bad('Tip must be between 0.0001 and 100 ZEC.');
    if (!['shielded', 'transparent'].includes(pool)) throw bad('Pool must be shielded or transparent.');
    const tx = txid && /^[a-f0-9]{64}$/i.test(txid) ? txid.toLowerCase() : null;
    await q('INSERT INTO tips (coin, zec, pool, txid) VALUES ($1,$2,$3,$4)', [c.address, z, pool, tx]);
    return { ok: true, verified: false };
  });

  // ---- on-chain reads for the site (quotes, balances, claimable fees)
  const lp = (functionName, args) => client.readContract({ address: config.launchpad, abi: abi.launchpad, functionName, args });
  app.get('/api/quote', async req => {
    if (!config.launchpad) throw bad('The launchpad is not configured.');
    const coin = addrParam(String(req.query.coin || ''));
    const side = req.query.side === 'sell' ? 'sell' : 'buy';
    let amount;
    try { amount = parseEther(String(req.query.amount || '0')); } catch { throw bad('Amount is not a number.'); }
    if (amount <= 0n) throw bad('Enter an amount above zero.');
    try {
      if (side === 'buy') { const [tokens, fee] = await lp('quoteBuy', [coin, amount]); return { side, tokens: tokens.toString(), fee: fee.toString() }; }
      const [eth, fee] = await lp('quoteSell', [coin, amount]); return { side, eth: eth.toString(), fee: fee.toString() };
    } catch (e) {
      const m = /CoinGraduated/.test(e.message) ? 'This coin sold out its curve and graduated.' : /BadInput/.test(e.message) ? 'That is more than the curve can take.' : 'Could not get a quote from the chain.';
      throw bad(m);
    }
  });
  app.get('/api/balance', async req => {
    const coin = addrParam(String(req.query.coin || '')), who = addrParam(String(req.query.address || ''));
    const bal = await client.readContract({ address: coin, abi: abi.token, functionName: 'balanceOf', args: [who] });
    return { tokens: bal.toString() };
  });
  app.get('/api/claimable/:address', async req => {
    if (!config.launchpad) return { eth: '0' };
    const v = await lp('creatorFees', [addrParam(req.params.address)]);
    return { eth: formatEther(v), wei: v.toString() };
  });

  // ---- wallet sign-in
  app.get('/api/auth/nonce', async (req) => {
    const address = String(req.query.address || '');
    if (!isAddress(address)) throw bad('Connect an Ethereum wallet first.');
    const nonce = await newNonce();
    return { message: messageFor(address, nonce, new URL(config.publicUrl).host) };
  });
  app.post('/api/auth/verify', async (req, reply) => {
    limit(req.ip, 'auth', 20, 600_000);
    const { address, message, signature } = req.body || {};
    if (!isAddress(address || '') || typeof message !== 'string' || typeof signature !== 'string') throw bad('Missing sign-in data.');
    let who;
    try { who = await verifySignIn(address, message, signature); } catch (e) { throw bad(e.message); }
    reply.setCookie('hp_session', sessionToken(who), { path: '/', httpOnly: true, sameSite: 'lax', secure: config.publicUrl.startsWith('https'), maxAge: 7 * 86400 });
    return { address: who };
  });
  app.post('/api/auth/logout', async (req, reply) => { reply.clearCookie('hp_session', { path: '/' }); return { ok: true }; });
  const me = req => readSession(req.cookies.hp_session);
  app.get('/api/me', async req => {
    const a = me(req);
    if (!a) return { address: null };
    const claimable = config.launchpad ? await client.readContract({ address: config.launchpad, abi: abi.launchpad, functionName: 'creatorFees', args: [a] }).catch(() => 0n) : 0n;
    return { address: a, claimableEth: formatEther(claimable) };
  });
  app.patch('/api/coins/:address', async req => {
    const a = me(req);
    if (!a) throw Object.assign(new Error('Sign in with the wallet that launched this coin.'), { statusCode: 401 });
    const coin = await one('SELECT creator FROM coins WHERE address = $1', [addrParam(req.params.address)]);
    if (!coin) throw Object.assign(new Error('Coin not found.'), { statusCode: 404 });
    if (coin.creator !== a) throw Object.assign(new Error('Only the wallet that launched this coin can change it.'), { statusCode: 403 });
    const b = req.body || {};
    if ('zecAddr' in b) await q('UPDATE coins SET zec_addr = $2, tips_off = CASE WHEN $2::text IS NULL THEN true ELSE tips_off END WHERE address = $1', [req.params.address.toLowerCase(), checkZec(b.zecAddr)]);
    if ('tipsOff' in b) {
      const cur = await one('SELECT zec_addr FROM coins WHERE address = $1', [req.params.address.toLowerCase()]);
      if (!b.tipsOff && !cur.zec_addr) throw bad('Add a Zcash address to this coin before turning tips on.');
      await q('UPDATE coins SET tips_off = $2 WHERE address = $1', [req.params.address.toLowerCase(), !!b.tipsOff]);
    }
    return coinJson(await one(`${COIN_SELECT} WHERE c.address = $1`, [req.params.address.toLowerCase()]));
  });

  // ---- video renderer callback (VIDEO_PROVIDER=webhook)
  app.post('/api/reels/:id/callback', async req => {
    if (!verifyCallback(req.rawBody || '', req.headers['x-hyperpad-signature'])) throw Object.assign(new Error('Bad signature.'), { statusCode: 401 });
    try { return await completeReel(Number(req.params.id), req.body || {}); } catch (e) { throw bad(e.message); }
  });

  // ---- live updates
  app.get('/api/stream', (req, reply) => {
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    reply.raw.write('retry: 5000\n\n');
    const off = subscribe(msg => reply.raw.write(msg));
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => { off(); clearInterval(ping); });
  });
}
