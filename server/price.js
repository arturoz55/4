// ETH/USD for turning fees into the $25 reel budget. Coinbase public spot price, cached for a minute.
import { config } from './config.js';

let cached = { usd: config.ethUsdFallback, at: 0 };
export async function ethUsd() {
  if (config.priceSource === 'fixed') return config.ethUsdFallback;
  if (Date.now() - cached.at < 60_000) return cached.usd;
  try {
    const r = await fetch('https://api.coinbase.com/v2/prices/ETH-USD/spot', { signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    const v = Number(j?.data?.amount);
    if (v > 0) cached = { usd: v, at: Date.now() };
  } catch (e) {
    console.warn('ETH price fetch failed, using last known value:', e.message);
    cached.at = Date.now() - 30_000; // retry sooner
  }
  return cached.usd;
}
