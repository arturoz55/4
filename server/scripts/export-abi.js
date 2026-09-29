// Copies the compiled launchpad and token ABIs into server/abi.json (run after `npx hardhat compile` in contracts/).
import fs from 'node:fs';
const read = p => JSON.parse(fs.readFileSync(new URL(`../../contracts/artifacts/contracts/${p}`, import.meta.url)));
const out = { launchpad: read('HyperpadLaunchpad.sol/HyperpadLaunchpad.json').abi, token: read('HyperpadToken.sol/HyperpadToken.json').abi };
fs.writeFileSync(new URL('../abi.json', import.meta.url), JSON.stringify(out));
console.log('wrote server/abi.json');
