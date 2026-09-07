import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Wrap } from './Wrap'
import { Redeem } from './Redeem'
import { FoundryCalc, FurnaceCalc } from './Calculators'

export function More({ title, children }: { title: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const reveal = () => {
      let id = location.hash.slice(1)
      try { id = decodeURIComponent(id) } catch { return }
      const target = id && document.getElementById(id)
      if (target && ref.current?.contains(target)) {
        ref.current.open = true
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }))
      }
    }
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null
      if (link?.getAttribute('href') === location.hash) reveal()
    }
    reveal(); window.addEventListener('hashchange', reveal); document.addEventListener('click', onClick)
    return () => { window.removeEventListener('hashchange', reveal); document.removeEventListener('click', onClick) }
  }, [])
  return <details ref={ref} className="home-more"><summary>{title}</summary><div>{children}</div></details>
}

function Tabs({ names, ids, selected, choose }: { names: string[]; ids: string[]; selected: number; choose: (i: number) => void }) {
  return <div className="home-tabs" role="tablist" aria-label={names.join(' or ')}>{names.map((name, i) => <button key={name} type="button" role="tab" id={`${ids[i]}-tab`} aria-controls={`${ids[i]}-panel`} aria-selected={selected === i} tabIndex={selected === i ? 0 : -1} onClick={() => choose(i)} onKeyDown={e => {
    let n = i
    if (e.key === 'ArrowRight') n = (i + 1) % names.length
    else if (e.key === 'ArrowLeft') n = (i + names.length - 1) % names.length
    else if (e.key === 'Home') n = 0
    else if (e.key === 'End') n = names.length - 1
    else return
    e.preventDefault(); choose(n); document.getElementById(`${ids[n]}-tab`)?.focus()
  }}>{name}</button>)}</div>
}

export function ZcashDesk() {
  const [selected, setSelected] = useState(location.hash === '#redeem' ? 1 : 0)
  useEffect(() => {
    const sync = () => {
      if (location.hash === '#wrap' || location.hash === '#redeem') {
        setSelected(location.hash === '#redeem' ? 1 : 0)
        requestAnimationFrame(() => document.getElementById('zcash-desk')?.scrollIntoView({ block: 'start' }))
      }
    }
    sync(); window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  return <section className="band zcash-desk" id="zcash-desk"><div className="wrap">
    <p className="eyebrow">The Zcash desk</p><h2 className="h2">ZEC in. ZEC out.</h2>
    <p className="lede">Move between native Zcash and zZEC on Robinhood Chain, 1:1. Choose your direction.</p>
    <Tabs names={['Wrap ZEC → zZEC', 'Redeem zZEC → ZEC']} ids={['wrap', 'redeem']} selected={selected} choose={i => { setSelected(i); history.replaceState(null, '', i ? '#redeem' : '#wrap') }} />
    <div role="tabpanel" id="wrap-panel" aria-labelledby="wrap-tab" hidden={selected !== 0}><Wrap /></div>
    <div role="tabpanel" id="redeem-panel" aria-labelledby="redeem-tab" hidden={selected !== 1}><Redeem /></div>
  </div></section>
}

export function LoopCalculators() {
  const [selected, setSelected] = useState(location.hash === '#burn-math' ? 1 : 0)
  useEffect(() => {
    const sync = () => { if (location.hash === '#math' || location.hash === '#burn-math') setSelected(location.hash === '#burn-math' ? 1 : 0) }
    window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync)
  }, [])
  return <div className="loop-calculators"><Tabs names={['Foundry model', 'Furnace model']} ids={['foundry-model', 'furnace-model']} selected={selected} choose={setSelected} />
    <p className="model-note">Illustrations, not earnings forecasts. Foundry fee routing awaits Pons activation. Volume and token prices are assumptions.</p>
    <div id="math"><div role="tabpanel" id="foundry-model-panel" aria-labelledby="foundry-model-tab" hidden={selected !== 0}><FoundryCalc /></div></div>
    <div id="burn-math"><div role="tabpanel" id="furnace-model-panel" aria-labelledby="furnace-model-tab" hidden={selected !== 1}><FurnaceCalc /></div></div>
  </div>
}
