import { useState } from 'react'
import { CONTRACTS, TOKEN } from '../config'

/** The $ZEAL contract address: full, copyable, linked to the explorer. */
export function ContractAddress({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const addr = TOKEN.address
  if (!addr) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked: the address is still selectable */
    }
  }
  return (
    <div className={`ca ${compact ? 'ca-compact' : ''}`}>
      <span className="ca-l mono">${TOKEN.symbol} CA</span>
      <code className="ca-addr mono" title={addr}>{addr}</code>
      <button type="button" className="ca-btn mono" onClick={copy} aria-label="Copy contract address">
        {copied ? 'copied' : 'copy'}
      </button>
      <a className="ca-btn mono" href={`${CONTRACTS.explorer}/token/${addr}`} target="_blank" rel="noreferrer">
        explorer ↗
      </a>
    </div>
  )
}
