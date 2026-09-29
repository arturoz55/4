// Deploys HyperpadLaunchpad. Usage:
//   DEPLOYER_PRIVATE_KEY=0x... OWNER=0x... REEL_OPERATOR=0x... npm run deploy:testnet
// VIRTUAL_ETH and VIRTUAL_TOKENS set the curve shape (defaults: 1.5 ETH and 1.073B tokens,
// which sells the 800M curve supply for about 4.4 ETH).
const { ethers, network } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error('Set DEPLOYER_PRIVATE_KEY to deploy.');
  const owner = process.env.OWNER || deployer.address;
  const operator = process.env.REEL_OPERATOR || deployer.address;
  const vEth = ethers.parseEther(process.env.VIRTUAL_ETH || '1.5');
  const vTok = ethers.parseEther(process.env.VIRTUAL_TOKENS || '1073000000');
  console.log(`Deploying on ${network.name} (chain ${network.config.chainId}) from ${deployer.address}`);
  const Launchpad = await ethers.getContractFactory('HyperpadLaunchpad');
  const lp = await Launchpad.deploy(owner, operator, vEth, vTok);
  await lp.waitForDeployment();
  const address = await lp.getAddress();
  const block = (await lp.deploymentTransaction().wait()).blockNumber;
  console.log(`HyperpadLaunchpad: ${address} (block ${block})`);
  const out = path.join(__dirname, '..', 'deployments', `${network.name}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ network: network.name, chainId: network.config.chainId, launchpad: address, deployBlock: block, owner, reelOperator: operator }, null, 2));
  console.log(`Saved ${out}. Set LAUNCHPAD_ADDRESS=${address} and START_BLOCK=${block} on the server.`);
}
main().catch(e => { console.error(e); process.exit(1); });
