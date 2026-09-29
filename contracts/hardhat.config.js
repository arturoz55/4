require('@nomicfoundation/hardhat-ethers');
require('@nomicfoundation/hardhat-chai-matchers');

const key = process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.28',
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun' }
  },
  networks: {
    // Robinhood Chain (Arbitrum Orbit L2, ETH gas). Values from docs.robinhood.com/chain/connecting
    robinhoodTestnet: { url: process.env.RPC_URL || 'https://rpc.testnet.chain.robinhood.com', chainId: 46630, accounts: key },
    robinhood: { url: process.env.RPC_URL || 'https://rpc.mainnet.chain.robinhood.com', chainId: 4663, accounts: key }
  }
};
