// Integration check against a local Hardhat node + running server.
// Usage: API=http://localhost:3100 LAUNCHPAD=0x... node server/test/integration.mjs
import { createWalletClient, createPublicClient, http, parseEther, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import fs from 'node:fs';
const API = process.env.API, LP = process.env.LAUNCHPAD;
const abi = JSON.parse(fs.readFileSync(new URL('../abi.json', import.meta.url)));
const chain = defineChain({ id: 31337, name: 'local', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } } });
// Hardhat's public, well-known test keys (accounts #2 and #3). Never use them anywhere real.
const creator = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');
const trader = privateKeyToAccount('0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6');
const pub = createPublicClient({ chain, transport: http() });
const w = acc => createWalletClient({ account: acc, chain, transport: http() });
const j = async (path, opts = {}) => { const r = await fetch(API + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } }); const b = await r.json(); if (!r.ok) throw new Error(`${path}: ${r.status} ${b.error}`); return { b, r }; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };

const png = 'data:image/png;base64,' + fs.readFileSync(new URL('../../marketing/images/hyperpad-profile.png', import.meta.url)).toString('base64');
const zs = 'zs1' + 'q'.repeat(75);
const SYM = 'M' + Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
const NAME = 'Mossy ' + SYM;
const { b: meta } = await j('/api/meta', { method: 'POST', body: JSON.stringify({ name: NAME, symbol: SYM, line: 'A small green coin for people who like being outside.', image: png, zecAddr: zs }) });
check(/\/api\/meta\/[a-f0-9]{32}$/.test(meta.metadataURI), 'metadata uploaded');
const bad = await fetch(API + '/api/meta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'x', symbol: 'no', line: 'short' }) });
check(bad.status === 400, 'metadata validation rejects bad input');

let hash = await w(creator).writeContract({ address: LP, abi: abi.launchpad, functionName: 'createCoin', args: [NAME, SYM, meta.metadataURI, 0n], value: parseEther('0.2') });
const rc = await pub.waitForTransactionReceipt({ hash });
check(rc.status === 'success', 'createCoin mined');
const count = await pub.readContract({ address: LP, abi: abi.launchpad, functionName: 'coinCount' });
const token = await pub.readContract({ address: LP, abi: abi.launchpad, functionName: 'allCoins', args: [count - 1n] });

for (const v of ['1', '0.5', '0.8']) {
  const [q] = await pub.readContract({ address: LP, abi: abi.launchpad, functionName: 'quoteBuy', args: [token, parseEther(v)] });
  hash = await w(trader).writeContract({ address: LP, abi: abi.launchpad, functionName: 'buy', args: [token, q * 99n / 100n, BigInt(Math.floor(Date.now() / 1000) + 600)], value: parseEther(v) });
  await pub.waitForTransactionReceipt({ hash });
}
const bal = await pub.readContract({ address: token, abi: abi.token, functionName: 'balanceOf', args: [trader.address] });
hash = await w(trader).writeContract({ address: token, abi: abi.token, functionName: 'approve', args: [LP, bal / 4n] }); await pub.waitForTransactionReceipt({ hash });
hash = await w(trader).writeContract({ address: LP, abi: abi.launchpad, functionName: 'sell', args: [token, bal / 4n, 0n, BigInt(Math.floor(Date.now() / 1000) + 600)] }); await pub.waitForTransactionReceipt({ hash });
// wait for the indexer to catch up with the last trade
let coin;
for (let i = 0; i < 40; i++) {
  const r = await fetch(API + '/api/coins/' + token);
  if (r.ok) { coin = await r.json(); const t = await (await fetch(`${API}/api/coins/${token}/trades`)).json(); if (t.length === 5) break; }
  await sleep(500);
}
console.log('coin', { name: coin.name, line: coin.line, image: coin.image, zec: !!coin.zecAddr, reels: coin.reels, feesUsd: coin.feesUsd.toFixed(2), fund: coin.reelFundUsd.toFixed(2) });
check(coin.name === NAME && coin.line.startsWith('A small') && coin.image && coin.zecAddr === zs, 'profile linked to on-chain coin');
// fees: buys 0.2+1+0.5+0.8 = 2.5 ETH plus a sell -> just over 0.025 ETH fees -> ~$75+ at $3000; half funds reels -> 1 reel
check(coin.feesUsd > 75 && coin.reels >= 1, `fees in USD tracked and reels queued (${coin.reels})`);
const { b: trades } = await j(`/api/coins/${token}/trades`);
check(trades.length === 5 && trades.some(t => !t.isBuy), `trades indexed (${trades.length})`);
const img = await fetch(API + coin.image); check(img.ok && img.headers.get('content-type') === 'image/png', 'image served');
await sleep(8000);
const { b: reels } = await j(`/api/coins/${token}/reels`);
check(reels.length >= 1 && reels.every(r => r.status === 'posted'), `mock renderer posted reels (${reels.map(r => r.status)})`);
const { b: list } = await j('/api/coins?sort=fees&q=' + SYM.toLowerCase());
check(list.length === 1, 'search and sort');
const { b: stats } = await j('/api/stats'); check(stats.coins >= 1 && stats.reels >= 1, 'stats');

// tips
const t1 = await fetch(API + '/api/tips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coin: token, zec: 0.1, pool: 'shielded' }) });
check(t1.ok, 'tip recorded');
const t2 = await fetch(API + '/api/tips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coin: token, zec: 999, pool: 'shielded' }) });
check(t2.status === 400, 'tip amount validated');

// sign in with the creator wallet, then edit the coin
const { b: n } = await j('/api/auth/nonce?address=' + creator.address);
const signature = await creator.signMessage({ message: n.message });
const { r: vr } = await j('/api/auth/verify', { method: 'POST', body: JSON.stringify({ address: creator.address, message: n.message, signature }) });
const ck = vr.headers.get('set-cookie').split(';')[0];
const { b: me } = await j('/api/me', { headers: { cookie: ck } });
check(me.address === creator.address.toLowerCase() && Number(me.claimableEth) > 0, `signed in, claimable ${me.claimableEth} ETH`);
const replay = await fetch(API + '/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address: creator.address, message: n.message, signature }) });
check(replay.status === 400, 'nonce cannot be replayed');
const { b: edited } = await j('/api/coins/' + token, { method: 'PATCH', headers: { cookie: ck }, body: JSON.stringify({ tipsOff: true }) });
check(edited.tipsOff === true, 'creator can edit their coin');
const stranger = await fetch(API + '/api/coins/' + token, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipsOff: false }) });
check(stranger.status === 401, 'others cannot edit it');
console.log('token', token);
