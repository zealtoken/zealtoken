import 'dotenv/config' // loads contracts/.env so the deployer key never has to be pasted anywhere
import type { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'

// Signing goes through the encrypted keystore (scripts/lib/secure.ts). A raw key in the
// environment is refused unless explicitly allowed, so one cannot silently reappear.
if (process.env.DEPLOYER_KEY && process.env.ALLOW_RAW_KEY !== '1') throw new Error('DEPLOYER_KEY is set; use the keystore (or ALLOW_RAW_KEY=1 on purpose)')
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
