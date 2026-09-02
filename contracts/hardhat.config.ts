import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

const PK = process.env.DEPLOYER_KEY ? [process.env.DEPLOYER_KEY] : []

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 400 },
      // Robinhood Chain is an Arbitrum Orbit chain. `paris` avoids depending on
      // PUSH0/MCOPY opcode availability, which costs almost nothing here and
      // removes a whole class of "works on Ethereum, reverts on the L2" bugs.
      evmVersion: 'paris',
    },
  },
  networks: {
    rhMainnet: {
      url: process.env.RH_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com',
      chainId: 4663,
      accounts: PK,
    },
    rhTestnet: {
      url: process.env.RH_TESTNET_RPC_URL ?? 'https://rpc.testnet.chain.robinhood.com',
      accounts: PK,
    },
  },
}

export default config
