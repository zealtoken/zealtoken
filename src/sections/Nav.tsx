import { useEffect, useState } from 'react'
import { LINKS, TOKEN } from '../config'

/** Four groups instead of twelve flat links. Order is what a visitor wants first: do something, understand it, check it. */
const GROUPS: { label: string; href?: string; items?: { href: string; label: string; note: string }[] }[] = [
  {
    label: 'Use it',
    items: [
      { href: '#wrap', label: 'Wrap', note: 'ZEC in, zZEC out, 1:1' },
      { href: '#redeem', label: 'Redeem', note: 'zZEC back to native ZEC' },
      { href: '#market', label: 'Market', note: 'trade zZEC against ETH' },
      { href: '#liquidity', label: 'The Herd', note: 'add depth, earn fees' },
    ],
  },
  {
    label: 'How it works',
    items: [
      { href: '#gap', label: 'The Gap', note: 'why any of this exists' },
      { href: '#foundry', label: 'The Foundry', note: 'where the fees go' },
      { href: '#furnace', label: 'The Furnace', note: 'buys back and burns $ZEAL' },
      { href: '#lore', label: 'Lore', note: 'the short version' },
    ],
  },
  {
    label: 'Proof',
    items: [
      { href: '#proof', label: 'Live proof', note: 'reserve, coverage, burns' },
      { href: '#phases', label: 'Roadmap', note: 'what is done, what is next' },
      { href: '#faq', label: 'FAQ', note: 'the awkward questions' },
    ],
  },
  { label: 'Docs', href: '/docs/' },
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
          {GROUPS.map((g) =>
            g.href ? (
              <a key={g.label} className="nav-top" href={g.href} onClick={() => setOpen(false)}>{g.label}</a>
            ) : (
              <div key={g.label} className="nav-group">
                <button className="nav-top" aria-haspopup="true">{g.label}<span className="nav-caret" aria-hidden>&#8964;</span></button>
                <div className="nav-menu">
                  {g.items!.map((it) => (
                    <a key={it.href} href={it.href} onClick={() => setOpen(false)}>
                      <b>{it.label}</b><i>{it.note}</i>
                    </a>
                  ))}
                </div>
              </div>
            ),
          )}
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
