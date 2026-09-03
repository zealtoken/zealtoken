import { STATIONS } from '../config'

/** The caption row under a plate. One component, so both plates read the same. */
export function StationStrip({ which }: { which: keyof typeof STATIONS }) {
  return (
    <div className="strip" role="list" aria-label="Stations">
      <div className="wrap strip-in">
        {STATIONS[which].map((st) => (
          <div className="strip-item" role="listitem" key={st.n}>
            <span className="strip-n mono">{st.n}</span>
            <span className="strip-t">{st.t}</span>
            <span className="strip-s mono">{st.s}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
