import type { ReactNode } from 'react'
export function Frame({ title, note, children, tall = false }: { title: string; note?: string; children: ReactNode; tall?: boolean }) {
  return (
    <figure className={`viz ${tall ? 'viz-tall' : ''}`}>
      <figcaption className="viz-cap mono"><span className="viz-dot" />{title}{note && <em>{note}</em>}</figcaption>
      <div className="viz-body">{children}</div>
    </figure>
  )
}
