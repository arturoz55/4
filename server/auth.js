// Sign in with an Ethereum wallet: the wallet signs a one-time message (no transaction, no gas).
import crypto from 'node:crypto';
import { config } from './config.js';
import { client } from './chain.js';
import { q, one } from './db.js';

export async function newNonce() {
  const nonce = crypto.randomBytes(16).toString('hex');
  await q("DELETE FROM nonces WHERE created_at < now() - interval '15 minutes'");
  await q('INSERT INTO nonces (nonce) VALUES ($1)', [nonce]);
  return nonce;
}
export function messageFor(address, nonce, host) {
  return `${host} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to Hyperpad. This does not send a transaction or cost gas.\n\nURI: ${config.publicUrl}\nVersion: 1\nChain ID: ${config.chain.id}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
}
export async function verifySignIn(address, message, signature) {
  const nonce = /Nonce: ([a-f0-9]{32})/.exec(message)?.[1];
  const addrLine = message.split('\n')[1];
  if (!nonce || !addrLine || addrLine.toLowerCase() !== address.toLowerCase()) throw new Error('Message does not match this address.');
  const row = await one("DELETE FROM nonces WHERE nonce = $1 AND created_at > now() - interval '10 minutes' RETURNING nonce", [nonce]);
  if (!row) throw new Error('Sign-in request expired. Try again.');
  // publicClient.verifyMessage also supports smart-contract wallets (ERC-1271).
  const ok = await client.verifyMessage({ address, message, signature });
  if (!ok) throw new Error('Signature does not match this address.');
  return address.toLowerCase();
}
const b64 = s => Buffer.from(s).toString('base64url');
export function sessionToken(address) {
  const body = b64(JSON.stringify({ a: address, e: Date.now() + 7 * 864e5 }));
  const sig = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const want = crypto.createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString()); return d.e > Date.now() ? d.a : null; } catch { return null; }
}
