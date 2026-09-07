import { ethers } from 'ethers'
import { atomicJson, readJson, stateDir, withLock } from './ops-lock.js'

/** Serialize a wallet on a chain and persist the hash BEFORE broadcasting.
 * Uncertain submissions block further sends until the transaction is resolved.
 */
export async function managedSend(wallet: ethers.Wallet, request: ethers.TransactionRequest, beforeBroadcast?: (hash: string) => void | Promise<void>) {
  const provider = wallet.provider!
  const chain = (await provider.getNetwork()).chainId
  const key = `wallet-${chain}-${wallet.address.toLowerCase()}`
  return withLock(key, async () => {
    const file = `${stateDir}${key}-pending.json`
    const previous = readJson<{ hash?: string }>(file, {})
    if (previous.hash) {
      const receipt = await provider.getTransactionReceipt(previous.hash)
      if (!receipt) throw new Error(`unresolved transaction ${previous.hash}; reconcile before sending again`)
      atomicJson(file, {})
    }
    const [latest, pending] = await Promise.all([provider.getTransactionCount(wallet.address, 'latest'), provider.getTransactionCount(wallet.address, 'pending')])
    if (pending !== latest) throw new Error('wallet already has a pending transaction')
    const populated = await wallet.populateTransaction({ ...request, nonce: pending })
    const raw = await wallet.signTransaction(populated)
    const hash = ethers.keccak256(raw)
    atomicJson(file, { hash, nonce: pending, at: new Date().toISOString() })
    // Bind the domain operation to this exact hash before any network submission.
    if (beforeBroadcast) await beforeBroadcast(hash)
    const tx = await provider.broadcastTransaction(raw)
    const receipt = await tx.wait(1, 60_000)
    if (!receipt || receipt.status !== 1) throw new Error(`transaction did not succeed: ${hash}`)
    atomicJson(file, {})
    return tx
  })
}
