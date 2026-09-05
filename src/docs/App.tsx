/// <reference types="vite/client" />
import { useEffect, useMemo, useRef, useState } from 'react'
import { marked } from 'marked'
import { LINKS, TOKEN } from '../config'

/**
 * The docs: markdown pages compiled into the bundle, rendered client-side with
 * hash routing (/docs/#/page). Each page opens with an "In one breath" block so
 * the plain-English version is always first; the depth follows.
 */
type Page = { slug: string; title: string; group: string; body: string }

const GROUPS = ['Start here', 'The machine', 'Using it', 'Running it', 'Ahead'] as const
const raw = import.meta.glob('./content/*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

function parse(): Page[] {
  return Object.entries(raw)
    .map(([path, body]) => {
      const m = body.match(/^---\n([\s\S]*?)\n---\n/)
      const meta: Record<string, string> = {}
      if (m) for (const line of m[1].split('\n')) { const i = line.indexOf(':'); if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim() }
      const slug = path.replace(/^.*\/(\d+-)?/, '').replace(/\.md$/, '')
      return { slug, title: meta.title ?? slug, group: meta.group ?? 'The machine', body: m ? body.slice(m[0].length) : body, order: Number(path.match(/\/(\d+)-/)?.[1] ?? 99) }
    })
    .sort((a, b) => a.order - b.order)
}

marked.use({ gfm: true, breaks: false })

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export function DocsApp() {
  const pages = useMemo(parse, [])
  const [route, setRoute] = useState(() => location.hash.replace(/^#\/?/, '') || pages[0].slug)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [toc, setToc] = useState<{ id: string; text: string; level: number }[]>([])
  const article = useRef<HTMLElement>(null)

  useEffect(() => {
    const onHash = () => { setRoute(location.hash.replace(/^#\/?/, '') || pages[0].slug); setOpen(false); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [pages])

  const page = pages.find((p) => p.slug === route) ?? pages[0]
  const html = useMemo(() => marked.parse(page.body) as string, [page])

  useEffect(() => {
    const el = article.current; if (!el) return
    const heads = Array.from(el.querySelectorAll('h2, h3')) as HTMLElement[]
    const used = new Set<string>()
    const items = heads.map((h) => { let id = slugify(h.textContent ?? ''); while (used.has(id)) id += '-'; used.add(id); h.id = id; return { id, text: h.textContent ?? '', level: h.tagName === 'H2' ? 2 : 3 } })
    setToc(items)
    // "In one breath" callouts: the first blockquote on a page
    const bq = el.querySelector('blockquote'); if (bq && /in one breath/i.test(bq.textContent ?? '')) bq.classList.add('breath')
    el.querySelectorAll('a[href^="http"]').forEach((a) => { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noreferrer') })
    document.title = `${page.title} · ZEAL Docs`
  }, [html, page.title])

  const filtered = q ? pages.filter((p) => (p.title + ' ' + p.body).toLowerCase().includes(q.toLowerCase())) : pages

  return (
    <div className="docs">
      <header className="docs-top">
        <a className="brand" href="/" aria-label="Zeal home"><img src="/img/zeal-mark.png" alt="" width={36} height={36} /><span>ZEAL</span><span className="docs-word mono">docs</span></a>
        <div className="docs-top-r">
          <a className="mono docs-toplink" href="/">site</a>
          <a className="mono docs-toplink" href={LINKS.repo ?? '#'} target="_blank" rel="noreferrer">github</a>
          <button className="nav-burger docs-burger" aria-label="menu" onClick={() => setOpen((v) => !v)}><span /><span /><span /></button>
        </div>
      </header>
      <div className="docs-body">
        <aside className={`docs-side ${open ? 'is-open' : ''}`}>
          <input className="docs-search mono" placeholder="search the docs" value={q} onChange={(e) => setQ(e.target.value)} />
          {GROUPS.map((g) => {
            const items = filtered.filter((p) => p.group === g)
            if (!items.length) return null
            return (
              <div className="docs-grp" key={g}>
                <div className="docs-grp-h mono">{g}</div>
                {items.map((p) => <a key={p.slug} className={`docs-link ${p.slug === page.slug ? 'is-active' : ''}`} href={`#/${p.slug}`}>{p.title}</a>)}
              </div>
            )
          })}
          <div className="docs-side-foot mono">{TOKEN.wrapper} · Robinhood Chain 4663</div>
        </aside>
        <main className="docs-main">
          <div className="docs-crumb mono">{page.group} / {page.title}</div>
          <article ref={article} className="docs-article" dangerouslySetInnerHTML={{ __html: html }} />
          <nav className="docs-pager">
            {(() => { const i = pages.indexOf(page); const prev = pages[i - 1], next = pages[i + 1]; return (<>
              {prev ? <a href={`#/${prev.slug}`}>← {prev.title}</a> : <span />}
              {next ? <a href={`#/${next.slug}`}>{next.title} →</a> : <span />}
            </>) })()}
          </nav>
        </main>
        <aside className="docs-toc">
          {toc.length > 0 && <div className="docs-grp-h mono">on this page</div>}
          {toc.map((t) => <a key={t.id} className={`docs-toc-l l${t.level}`} href={`#/${page.slug}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>{t.text}</a>)}
        </aside>
      </div>
    </div>
  )
}
