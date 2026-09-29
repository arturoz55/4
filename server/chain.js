import { createPublicClient, http, defineChain, parseAbi } from 'viem';
import fs from 'node:fs';
import { config } from './config.js';

export const abi = JSON.parse(fs.readFileSync(new URL('./abi.json', import.meta.url)));
export const chainDef = defineChain({
  id: config.chain.id, name: config.chain.name,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [config.chain.rpc] } },
  blockExplorers: config.chain.explorer ? { default: { name: 'Explorer', url: config.chain.explorer } } : undefined
});
export const client = createPublicClient({ chain: chainDef, transport: http(config.chain.rpc, { retryCount: 2, timeout: 10_000 }) });
export const erc20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
