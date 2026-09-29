// Local development: deploy to the Hardhat node (npx hardhat node) with its default funded accounts.
const { ethers } = require('hardhat');
const fs = require('fs'), path = require('path');
async function main() {
  const [owner, operator] = await ethers.getSigners();
  const lp = await (await ethers.getContractFactory('HyperpadLaunchpad')).deploy(owner.address, operator.address, ethers.parseEther('1.5'), ethers.parseEther('1073000000'));
  await lp.waitForDeployment();
  const block = (await lp.deploymentTransaction().wait()).blockNumber;
  const out = { launchpad: await lp.getAddress(), deployBlock: block };
  fs.mkdirSync(path.join(__dirname, '..', 'deployments'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'deployments', 'localhost.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}
main().catch(e => { console.error(e); process.exit(1); });
