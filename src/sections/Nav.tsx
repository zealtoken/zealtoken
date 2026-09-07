import { useEffect, useState } from 'react'
import { LINKS, TOKEN } from '../config'

/** Primary actions plus grouped explanations and verification links. */
const GROUPS: { label: string; href?: string; external?: boolean; items?: { href: string; label: string; note: string }[] }[] = [
  { label: 'Liquidity', href: '#liquidity' },
  { label: 'Launchpad', href: '#launchpad' },
  {
    label: 'Use zZEC',
    items: [
      { href: '#wrap', label: 'Wrap', note: 'ZEC in, zZEC out, 1:1' },
      { href: '#redeem', label: 'Redeem', note: 'zZEC back to native ZEC' },
      { href: '#market', label: 'Market', note: 'trade zZEC against ETH' },
    ],
  },
  {
    label: 'How it works',
    items: [
      { href: '#participate', label: 'The ecosystem', note: '$ZEAL, zZEC, liquidity and zealz.fun' },
      { href: '#foundry', label: 'The Foundry', note: 'where the fees go' },
      { href: '#furnace', label: 'The Furnace', note: 'buys back and burns $ZEAL' },
      { href: '#lore', label: 'Lore', note: 'the short version' },
    ],
  },
  {
    label: 'Proof',
    items: [
      { href: '#ledger', label: 'Live accounting', note: 'reserve, coverage, fee routing' },
      { href: '#proof', label: 'Contracts', note: 'published code and addresses' },
      { href: '#phases', label: 'Roadmap', note: 'what is done, what is next' },
      { href: '#faq', label: 'FAQ', note: 'the awkward questions' },
    ],
  },
  { label: 'Docs', href: '/docs/' },
]

export function Nav() {
  const [stuck, setStuck] = useState(false)
  const [open, setOpen] = useState(false)
  const [submenu, setSubmenu] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header className={`nav ${stuck ? 'is-stuck' : ''}`} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        const trigger = event.currentTarget.querySelector<HTMLButtonElement>('.nav-top[aria-expanded="true"]')
        setSubmenu(null); setOpen(false); trigger?.focus()
      }
    }}>
      <div className="nav-in">
        <a className="brand" href="#top" aria-label="Zeal home">
          <img src="/img/zeal-mark.png" alt="" width={44} height={44} />
          <span>ZEAL</span>
        </a>

        <nav aria-label="Main navigation" className={`nav-links ${open ? 'is-open' : ''}`}>
          {GROUPS.map((g) =>
            g.href ? (
              <a key={g.label} className="nav-top" href={g.href} onClick={() => { setOpen(false); setSubmenu(null) }} {...(g.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                {g.label}{g.external && <span className="nav-ext" aria-hidden> &#8599;</span>}
              </a>
            ) : (
              <div key={g.label} className="nav-group" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSubmenu(null) }}>
                <button className="nav-top" type="button" aria-expanded={submenu === g.label} aria-controls={`menu-${g.label.replace(/ /g, "-")}`} onClick={() => setSubmenu(submenu === g.label ? null : g.label)}>{g.label}<span className="nav-caret" aria-hidden>&#8964;</span></button>
                <div className="nav-menu" id={`menu-${g.label.replace(/ /g, "-")}`} hidden={submenu !== g.label}>
                  {g.items!.map((it) => (
                    <a key={it.href} href={it.href} onClick={() => { setOpen(false); setSubmenu(null) }}>
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
