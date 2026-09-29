// Reel jobs. Every $25 of a coin's reel fees (50% of its 1% trading fee) queues one reel.
// VIDEO_PROVIDER: 'none' keeps jobs queued, 'mock' marks them posted after MOCK_RENDER_MS (for testing),
// 'webhook' POSTs each job to VIDEO_WEBHOOK_URL; the renderer calls back /api/reels/:id/callback.
import crypto from 'node:crypto';
import { config } from './config.js';
import { q, one } from './db.js';
import { publish } from './events.js';

export const FORMATS = ['talking head', 'unboxing', 'street interview', 'hot take', 'reaction', 'explainer', 'skit', 'podcast clip'];
export const HOSTS = ['Juniper', 'Rafa', 'Ines', 'Theo', 'Mika', 'Sol', 'Priya', 'Oskar', 'Lena', 'Kofi'];

/** Adds reel budget to a coin and queues as many reels as it now pays for. */
export async function fundReels(coin, usd) {
  const row = await one('UPDATE coins SET reel_fund_usd = reel_fund_usd + $2 WHERE address = $1 RETURNING reel_fund_usd, reels', [coin, usd]);
  let fund = Number(row.reel_fund_usd), reels = row.reels, made = 0;
  while (fund >= config.reelCostUsd) {
    fund -= config.reelCostUsd; reels += 1; made += 1;
    const last = await one('SELECT format FROM reels WHERE coin = $1 ORDER BY n DESC LIMIT 1', [coin]);
    // rotate formats and never repeat the previous one
    let fmt = FORMATS[reels % FORMATS.length];
    if (last && last.format === fmt) fmt = FORMATS[(reels + 1) % FORMATS.length];
    const r = await one('INSERT INTO reels (coin, n, format, host) VALUES ($1, $2, $3, $4) ON CONFLICT (coin, n) DO NOTHING RETURNING *',
      [coin, reels, fmt, HOSTS[(reels * 7 + coin.length) % HOSTS.length]]);
    if (r) publish('reel', r);
  }
  if (made) await q('UPDATE coins SET reel_fund_usd = $2, reels = $3, last_reel_at = now() WHERE address = $1', [coin, fund, reels]);
  else await q('UPDATE coins SET reel_fund_usd = $2 WHERE address = $1', [coin, fund]);
  return made;
}

async function setStatus(id, status, extra = {}) {
  const r = await one('UPDATE reels SET status = $2, video_url = COALESCE($3, video_url), error = $4, updated_at = now() WHERE id = $1 RETURNING *',
    [id, status, extra.videoUrl || null, extra.error || null]);
  if (r) publish('reel', r);
  return r;
}

async function dispatch(job) {
  const coin = await one('SELECT address, name, symbol, line, image_id FROM coins WHERE address = $1', [job.coin]);
  if (config.videoProvider === 'mock') {
    await setStatus(job.id, 'rendering');
    setTimeout(() => setStatus(job.id, 'posted').catch(console.error), config.mockRenderMs);
    return;
  }
  if (config.videoProvider === 'webhook') {
    if (!config.videoWebhookUrl) return;
    const body = {
      reelId: job.id, n: job.n, format: job.format, host: job.host,
      coin: { address: coin.address, name: coin.name, symbol: coin.symbol, line: coin.line, image: coin.image_id ? `${config.publicUrl}/api/img/${coin.image_id}` : null },
      callbackUrl: `${config.publicUrl}/api/reels/${job.id}/callback`
    };
    const sig = crypto.createHmac('sha256', config.videoWebhookSecret).update(JSON.stringify(body)).digest('hex');
    const r = await fetch(config.videoWebhookUrl, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hyperpad-signature': sig }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`renderer answered ${r.status}`);
    await setStatus(job.id, 'rendering');
  }
  // 'none': leave the job queued until a provider is configured.
}

export function verifyCallback(rawBody, signature) {
  if (!config.videoWebhookSecret || !signature) return false;
  const want = crypto.createHmac('sha256', config.videoWebhookSecret).update(rawBody).digest('hex');
  return want.length === signature.length && crypto.timingSafeEqual(Buffer.from(want), Buffer.from(signature));
}
export async function completeReel(id, { status, videoUrl, error }) {
  if (!['posted', 'failed'].includes(status)) throw new Error('status must be posted or failed');
  if (videoUrl && !/^https:\/\//.test(videoUrl)) throw new Error('videoUrl must be https');
  return setStatus(id, status, { videoUrl, error });
}

export function startReelWorker() {
  if (config.videoProvider === 'none') { console.log('VIDEO_PROVIDER=none: reels stay queued until a provider is set.'); return; }
  let busy = false;
  setInterval(async () => {
    if (busy) return; busy = true;
    try {
      const jobs = await q("SELECT * FROM reels WHERE status = 'queued' ORDER BY id LIMIT 5");
      for (const j of jobs) {
        try { await dispatch(j); } catch (e) { console.error('reel dispatch failed', j.id, e.message); await setStatus(j.id, 'queued', { error: e.message }); }
      }
    } finally { busy = false; }
  }, 3000);
}
