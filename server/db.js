// Postgres via DATABASE_URL (Railway). Without it, falls back to PGlite (Postgres in WebAssembly) for local runs.
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BYTEA NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS meta (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, symbol TEXT NOT NULL, line TEXT NOT NULL,
  image_id TEXT REFERENCES images(id), zec_addr TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS coins (
  address TEXT PRIMARY KEY, creator TEXT NOT NULL, name TEXT NOT NULL, symbol TEXT NOT NULL,
  metadata_uri TEXT NOT NULL, meta_id TEXT REFERENCES meta(id), line TEXT NOT NULL DEFAULT '', image_id TEXT,
  zec_addr TEXT, tips_off BOOLEAN NOT NULL DEFAULT false,
  created_block BIGINT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
  reels INT NOT NULL DEFAULT 0, fees_wei NUMERIC NOT NULL DEFAULT 0, fees_usd NUMERIC NOT NULL DEFAULT 0,
  reel_fund_usd NUMERIC NOT NULL DEFAULT 0, volume_wei NUMERIC NOT NULL DEFAULT 0,
  virtual_eth NUMERIC NOT NULL DEFAULT 0, virtual_tokens NUMERIC NOT NULL DEFAULT 0, tokens_sold NUMERIC NOT NULL DEFAULT 0,
  graduated BOOLEAN NOT NULL DEFAULT false, last_trade_at TIMESTAMPTZ, last_reel_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS trades (
  tx_hash TEXT NOT NULL, log_index INT NOT NULL, coin TEXT NOT NULL REFERENCES coins(address), trader TEXT NOT NULL,
  is_buy BOOLEAN NOT NULL, eth_wei NUMERIC NOT NULL, token_amount NUMERIC NOT NULL, fee_wei NUMERIC NOT NULL,
  eth_usd NUMERIC NOT NULL, block BIGINT NOT NULL, ts TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (tx_hash, log_index)
);
CREATE INDEX IF NOT EXISTS trades_coin_ts ON trades (coin, ts DESC);
CREATE TABLE IF NOT EXISTS reels (
  id SERIAL PRIMARY KEY, coin TEXT NOT NULL REFERENCES coins(address), n INT NOT NULL, format TEXT NOT NULL, host TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued', video_url TEXT, error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (coin, n)
);
CREATE TABLE IF NOT EXISTS tips (
  id SERIAL PRIMARY KEY, coin TEXT NOT NULL REFERENCES coins(address), zec NUMERIC NOT NULL, pool TEXT NOT NULL,
  txid TEXT, verified BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

let impl;
export async function initDb() {
  if (config.databaseUrl) {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({ connectionString: config.databaseUrl, ssl: /localhost|127\.0\.0\.1|railway\.internal/.test(config.databaseUrl) ? false : { rejectUnauthorized: false } });
    impl = { query: (text, params) => pool.query(text, params), exec: text => pool.query(text), close: () => pool.end() };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const lite = new PGlite(config.pgliteDir || undefined);
    impl = { query: (text, params) => lite.query(text, params), exec: text => lite.exec(text), close: () => lite.close() };
    console.log(`Using PGlite ${config.pgliteDir ? 'at ' + config.pgliteDir : 'in memory'} (set DATABASE_URL for Postgres).`);
  }
  await impl.exec(SCHEMA);
}
export const q = async (text, params = []) => (await impl.query(text, params)).rows;
export const one = async (text, params = []) => (await q(text, params))[0] || null;
export const closeDb = () => impl && impl.close();
