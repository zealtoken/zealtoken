import { Frame } from './Frame'
/** Animated SVG flows. Pure vectors, theme tokens, dashed paths that crawl in the flow direction. */
type Node = { id: string; x: number; y: number; w?: number; t: string; s?: string; g?: boolean }
type Edge = { a: string; b: string; t?: string }
function Diagram({ nodes, edges, h = 240, viewW = 760 }: { nodes: Node[]; edges: Edge[]; h?: number; viewW?: number }) {
  const N = Object.fromEntries(nodes.map((n) => [n.id, { ...n, w: n.w ?? 128 }]))
  return (
    <svg className="flow-svg" viewBox={`0 0 ${viewW} ${h}`} role="img">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--green)" /></marker></defs>
      {edges.map((e, i) => { const a = N[e.a], b = N[e.b]; const x1 = a.x + a.w / 2, y1 = a.y, x2 = b.x - b.w / 2, y2 = b.y; const mx = (x1 + x2) / 2; const d = `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`; return (
        <g key={i}><path d={d} className="flow-track" /><path d={d} className="flow-dash" markerEnd="url(#arr)" />{e.t && <text x={mx} y={(y1 + y2) / 2 - 8} className="flow-et">{e.t}</text>}</g>) })}
      {nodes.map((n) => { const w = n.w ?? 128; return (
        <g key={n.id} className={`flow-n ${n.g ? 'g' : ''}`}><rect x={n.x - w / 2} y={n.y - 28} width={w} height={56} rx="12" /><text x={n.x} y={n.y - (n.s ? 4 : -5)} className="flow-t">{n.t}</text>{n.s && <text x={n.x} y={n.y + 15} className="flow-s">{n.s}</text>}</g>) })}
    </svg>
  )
}
export function FeeRouteFlow() {
  return (
    <Frame title="One $100 $ZEAL trade" note="where the dollar of fees goes · the Foundry has no owner and the Tap has one exit">
      <Diagram h={250} nodes={[
        { id: 'trade', x: 70, y: 125, t: '$100 trade', s: 'Pons pool', w: 110 },
        { id: 'fee', x: 215, y: 125, t: '$1.00 fee', s: '1% of the trade', w: 120 },
        { id: 'pons', x: 380, y: 45, t: 'Pons keeps $0.30', s: '30% of the fee', w: 150 },
        { id: 'tap', x: 380, y: 160, t: 'Tap → Foundry $0.70', s: 'creator share · one exit', w: 170 },
        { id: 'res', x: 630, y: 60, t: '$0.42 → ZEC', s: '60% · the reserve', w: 150, g: true },
        { id: 'liq', x: 630, y: 145, t: '$0.175 → liquidity', s: '25% · zZEC market', w: 150 },
        { id: 'ops', x: 630, y: 225, t: '$0.105 → operations', s: '15%', w: 150 },
      ]} edges={[{ a: 'trade', b: 'fee' }, { a: 'fee', b: 'pons' }, { a: 'fee', b: 'tap' }, { a: 'tap', b: 'res' }, { a: 'tap', b: 'liq' }, { a: 'tap', b: 'ops' }]} />
    </Frame>
  )
}
export function TradeSplitFlow() {
  return (
    <Frame title="One zZEC trade" note="1% total · liquidity providers keep 0.3% · the hook's 0.7% becomes burned $ZEAL">
      <Diagram h={230} nodes={[
        { id: 'sw', x: 70, y: 115, t: 'zZEC swap', s: 'Uniswap v4', w: 110 },
        { id: 'lp', x: 250, y: 50, t: '0.3% to LPs', s: 'stays in the pool', w: 140 },
        { id: 'hk', x: 250, y: 165, t: '0.7% to the hook', s: 'taken from output', w: 150, g: true },
        { id: 'fu', x: 430, y: 165, t: 'Furnace', s: 'zZEC → ETH → $ZEAL', w: 140, g: true },
        { id: 'bn', x: 620, y: 165, t: '0x…dEaD', s: 'burned, counted, public', w: 150 },
      ]} edges={[{ a: 'sw', b: 'lp' }, { a: 'sw', b: 'hk' }, { a: 'hk', b: 'fu' }, { a: 'fu', b: 'bn', t: 'ignite · daily' }]} />
    </Frame>
  )
}
/** A small state machine drawn left to right, with side exits below. */
export function States({ title, note, states, edges }: { title: string; note: string; states: Node[]; edges: Edge[] }) {
  return <Frame title={title} note={note}><Diagram h={240} nodes={states} edges={edges} /></Frame>
}
export function WrapStates() {
  return <States title="A wrap request, start to finish" note="the desk never holds funds · cancel any time before you send · the operator can only mint to the requester" states={[
    { id: 'o', x: 80, y: 80, t: 'Open', s: 'request(amount)', w: 130 },
    { id: 'f', x: 290, y: 80, t: 'Funded', s: 'exact deposit seen', w: 150 },
    { id: 'c', x: 500, y: 80, t: '3 confirmations', s: '~4 minutes', w: 160 },
    { id: 'm', x: 680, y: 80, t: 'Minted', s: 'fulfill(id, txid)', w: 130, g: true },
    { id: 'x', x: 80, y: 190, t: 'Cancelled', s: 'by you, unfunded', w: 130 },
    { id: 'r', x: 500, y: 190, t: 'Rejected', s: 'wrong amount · ZEC returned by hand', w: 200 },
  ]} edges={[{ a: 'o', b: 'f', t: 'you send ZEC' }, { a: 'f', b: 'c' }, { a: 'c', b: 'm', t: 'attest → mint' }, { a: 'o', b: 'x' }, { a: 'f', b: 'r' }]} />
}
export function RedeemStates() {
  return <States title="A redemption, start to finish" note="your zZEC is escrowed, not burned · the burn happens only after a Zcash txid is recorded · reclaim is yours after 7 days" states={[
    { id: 'o', x: 80, y: 80, t: 'Open', s: 'zZEC in escrow', w: 130 },
    { id: 'p', x: 300, y: 80, t: 'Paid', s: 'ZEC sent to your t-address', w: 170 },
    { id: 'f', x: 540, y: 80, t: 'Fulfilled', s: 'txid on chain · escrow burned', w: 180, g: true },
    { id: 'r', x: 300, y: 190, t: 'Reclaimed', s: 'after 7 days, by you, unconditionally', w: 230 },
  ]} edges={[{ a: 'o', b: 'p', t: 'operator pays' }, { a: 'p', b: 'f', t: 'fulfill(id, txid)' }, { a: 'o', b: 'r', t: 'nothing arrived' }]} />
}
