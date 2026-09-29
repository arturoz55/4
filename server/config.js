// All runtime settings come from environment variables (set them in Railway → Variables).
const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const CHAINS = {
  testnet: { id: 46630, name: 'Robinhood Chain Testnet', rpc: 'https://rpc.testnet.chain.robinhood.com', explorer: 'https://explorer.testnet.chain.robinhood.com' },
  mainnet: { id: 4663, name: 'Robinhood Chain', rpc: 'https://rpc.mainnet.chain.robinhood.com', explorer: 'https://robinhoodchain.blockscout.com' },
  local: { id: 31337, name: 'Local Hardhat', rpc: 'http://127.0.0.1:8545', explorer: '' }
};

const chainKey = env.CHAIN || 'testnet';
if (!CHAINS[chainKey]) throw new Error(`CHAIN must be one of ${Object.keys(CHAINS).join(', ')}`);
const chain = { ...CHAINS[chainKey], key: chainKey };
if (env.RPC_URL) chain.rpc = env.RPC_URL;

export const config = {
  port: num(env.PORT, 3000),
  host: env.HOST || '0.0.0.0',
  publicUrl: (env.PUBLIC_URL || `http://localhost:${num(env.PORT, 3000)}`).replace(/\/$/, ''),
  databaseUrl: env.DATABASE_URL || '',
  pgliteDir: env.PGLITE_DIR || '',               // local fallback when DATABASE_URL is not set
  chain,
  launchpad: (env.LAUNCHPAD_ADDRESS || '').toLowerCase(),
  startBlock: BigInt(env.START_BLOCK || '0'),
  pollMs: num(env.POLL_MS, 4000),
  logChunk: BigInt(env.LOG_CHUNK || '5000'),
  reelCostUsd: num(env.REEL_COST_USD, 25),
  ethUsdFallback: num(env.ETH_USD_FALLBACK, 3000),
  priceSource: env.PRICE_SOURCE || 'coinbase',    // 'coinbase' or 'fixed'
  videoProvider: env.VIDEO_PROVIDER || 'none',    // 'none', 'mock' or 'webhook'
  videoWebhookUrl: env.VIDEO_WEBHOOK_URL || '',
  videoWebhookSecret: env.VIDEO_WEBHOOK_SECRET || '',
  mockRenderMs: num(env.MOCK_RENDER_MS, 12000),
  sessionSecret: env.SESSION_SECRET || '',
  maxImageBytes: num(env.MAX_IMAGE_BYTES, 2 * 1024 * 1024)
};

if (!config.sessionSecret) {
  config.sessionSecret = 'dev-only-' + Math.random().toString(36).slice(2);
  if (env.NODE_ENV === 'production') console.warn('SESSION_SECRET is not set. Sign-ins will not survive a restart.');
}
