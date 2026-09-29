// Reads launchpad events from Robinhood Chain and mirrors them into Postgres.
import { formatEther } from 'viem';
import { config } from './config.js';
import { client, abi } from './chain.js';
import { q, one } from './db.js';
import { ethUsd } from './price.js';
import { fundReels } from './reels.js';
import { publish } from './events.js';

const blockTime = new Map();
async function tsOf(blockNumber) {
  const k = blockNumber.toString();
  if (!blockTime.has(k)) {
    const b = await client.getBlock({ blockNumber });
    blockTime.set(k, new Date(Number(b.timestamp) * 1000));
    if (blockTime.size > 2000) blockTime.delete(blockTime.keys().next().value);
  }
  return blockTime.get(k);
}

let initial = null;
async function initialReserves() {
  if (!initial) {
    const [ve, vt] = await Promise.all([
      client.readContract({ address: config.launchpad, abi: abi.launchpad, functionName: 'initialVirtualEth' }),
      client.readContract({ address: config.launchpad, abi: abi.launchpad, functionName: 'initialVirtualTokens' })
    ]);
    initial = { ve: ve.toString(), vt: vt.toString() };
  }
  return initial;
}

async function onCoinCreated(log) {
  const { token, creator, name, symbol, metadataURI } = log.args;
  const address = token.toLowerCase();
  // Link the off-chain profile (pitch line, image, ZEC address) only if it matches what was launched on chain.
  let meta = null;
  const m = /\/api\/meta\/([a-f0-9]{32})$/.exec(metadataURI || '');
  if (m) {
    const row = await one('SELECT * FROM meta WHERE id = $1', [m[1]]);
    if (row && row.name === name && row.symbol === symbol) meta = row;
  }
  const r = await initialReserves();
  const ts = await tsOf(log.blockNumber);
  const row = await one(`INSERT INTO coins (address, creator, name, symbol, metadata_uri, meta_id, line, image_id, zec_addr, tips_off, created_block, created_at, virtual_eth, virtual_tokens)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (address) DO NOTHING RETURNING address`,
    [address, creator.toLowerCase(), name, symbol, metadataURI, meta?.id || null, meta?.line || '', meta?.image_id || null, meta?.zec_addr || null, !meta?.zec_addr,
      log.blockNumber.toString(), ts, r.ve, r.vt]);
  if (row) publish('coin', { address });
}

async function onTrade(log) {
  const a = log.args;
  const coin = a.token.toLowerCase();
  const price = await ethUsd();
  const ts = await tsOf(log.blockNumber);
  const inserted = await one(`INSERT INTO trades (tx_hash, log_index, coin, trader, is_buy, eth_wei, token_amount, fee_wei, eth_usd, block, ts)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING RETURNING tx_hash`,
    [log.transactionHash, log.logIndex, coin, a.trader.toLowerCase(), a.isBuy, a.ethAmount.toString(), a.tokenAmount.toString(), a.fee.toString(), price, log.blockNumber.toString(), ts]);
  if (!inserted) return; // already processed
  const feeUsd = Number(formatEther(a.fee)) * price;
  await q(`UPDATE coins SET fees_wei = fees_wei + $2::numeric, fees_usd = fees_usd + $3, volume_wei = volume_wei + $4::numeric,
    virtual_eth = $5::numeric, virtual_tokens = $6::numeric, tokens_sold = $7::numeric, last_trade_at = $8 WHERE address = $1`,
    [coin, a.fee.toString(), feeUsd, a.ethAmount.toString(), a.virtualEth.toString(), a.virtualTokens.toString(), a.tokensSold.toString(), ts]);
  const made = await fundReels(coin, feeUsd * 0.5);
  publish('trade', { coin, trader: a.trader.toLowerCase(), isBuy: a.isBuy, eth: formatEther(a.ethAmount), usd: Number(formatEther(a.ethAmount)) * price, feeUsd, reelsMade: made, tx: log.transactionHash });
}

async function onGraduated(log) {
  const coin = log.args.token.toLowerCase();
  await q('UPDATE coins SET graduated = true WHERE address = $1', [coin]);
  publish('graduated', { coin });
}

const handlers = { CoinCreated: onCoinCreated, Trade: onTrade, Graduated: onGraduated };

export async function syncOnce() {
  const cur = await one("SELECT value FROM kv WHERE key = 'cursor'");
  let from = cur ? BigInt(cur.value) + 1n : config.startBlock;
  const latest = await client.getBlockNumber();
  if (process.env.DEBUG_INDEXER) console.log('indexer sync', from, '->', latest);
  let processed = 0;
  while (from <= latest) {
    const to = from + config.logChunk - 1n < latest ? from + config.logChunk - 1n : latest;
    const logs = await client.getContractEvents({ address: config.launchpad, abi: abi.launchpad, fromBlock: from, toBlock: to });
    logs.sort((x, y) => (x.blockNumber === y.blockNumber ? x.logIndex - y.logIndex : x.blockNumber < y.blockNumber ? -1 : 1));
    for (const log of logs) {
      const h = handlers[log.eventName];
      if (h) {
        if (process.env.DEBUG_INDEXER) console.log('indexer event', log.eventName, log.blockNumber);
        await h(log); processed++;
      }
    }
    await q("INSERT INTO kv (key, value) VALUES ('cursor', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [to.toString()]);
    from = to + 1n;
  }
  return processed;
}

export function startIndexer() {
  if (!config.launchpad) { console.warn('LAUNCHPAD_ADDRESS is not set: the indexer is off.'); return; }
  let running = false;
  const tick = async () => {
    if (running) return; running = true;
    try { await syncOnce(); } catch (e) { console.error('indexer:', e.shortMessage || e.message); } finally { running = false; }
  };
  tick();
  setInterval(tick, config.pollMs);
}
