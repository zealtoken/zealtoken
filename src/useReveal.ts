import { useEffect } from 'react'

/**
 * Reveal-on-scroll. Marks `.motion-ready` on <html> only after mount so the
 * page renders fully visible if JS never runs, then unveils `[data-reveal]`
 * elements once as they enter the viewport.
 */
export function useReveal() {
  useEffect(() => {
    const root = document.documentElement
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    root.classList.add('motion-ready')

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible')
            io.unobserve(e.target)
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    const nodes = document.querySelectorAll('[data-reveal]')
    nodes.forEach((n) => io.observe(n))
    // Sections that mount after a chain read (countdowns, live forms) arrive later; observe them too.
    const mo = new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (!(n instanceof Element)) continue
        if (n.matches('[data-reveal]')) io.observe(n)
        n.querySelectorAll('[data-reveal]').forEach((c) => io.observe(c))
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => { io.disconnect(); mo.disconnect() }
  }, [])
}

/** Convenience for staggering a list: style={stagger(i)} */
export const stagger = (i: number, step = 90) =>
  ({ ['--d' as string]: `${i * step}ms` }) as React.CSSProperties
