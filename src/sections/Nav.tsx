import { useEffect, useState } from 'react'
import { LINKS, TOKEN } from '../config'

const ITEMS = [
  { href: '#gap', label: 'The Gap' },
  { href: '#foundry', label: 'The Foundry' },
  { href: '#furnace', label: 'The Furnace' },
  { href: '#market', label: 'Market' },
  { href: '#redeem', label: 'Redeem' },
  { href: '#proof', label: 'Proof' },
  { href: '#phases', label: 'Roadmap' },
  { href: '#lore', label: 'Lore' },
  { href: '#faq', label: 'FAQ' },
]

export function Nav() {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav ${stuck ? 'is-stuck' : ''}`}>
      <div className="nav-in">
        <a className="brand" href="#top" aria-label="Zeal home">
          <img src="/img/zeal-mark.png" alt="" width={44} height={44} />
          <span>ZEAL</span>
        </a>

        <nav className={`nav-links ${open ? 'is-open' : ''}`}>
          {ITEMS.map((it) => (
            <a key={it.href} href={it.href} onClick={() => setOpen(false)}>
              {it.label}
            </a>
          ))}
        </nav>

        <div className="nav-cta">
          <a className="btn btn-primary btn-sm" href={LINKS.pons} target="_blank" rel="noreferrer">
            Buy ${TOKEN.symbol}
          </a>
          <button
            className="nav-burger"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  )
}
