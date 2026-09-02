/**
 * The Zeal Foundry.
 *
 * A single wide SVG scene read left to right: fees arrive as ETH, get split,
 * get smelted into real ZEC, land in the vault, and come out the far end as
 * zZEC. Every moving part maps to a real step in the mechanism — nothing here
 * is decoration for its own sake.
 */

import { Zebra } from './Zebra'
import { SPLIT } from '../config'

const PANEL = '#FFFFFF'
const PANEL_2 = '#E9E9E2'
const EDGE = '#0C0D0E'
const GOLD = '#F4B728'
const GREEN = '#00B204'

/** Small gold coin used as cargo on the belt. */
function Coin({ x, y, r = 13 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="1.5" r={r} fill="#A87107" />
      <circle cx="0" cy="0" r={r} fill={GOLD} />
      <circle cx="0" cy="0" r={r * 0.74} fill="none" stroke="#C9930F" strokeWidth="1.2" />
      <text
        x="0"
        y={r * 0.42}
        textAnchor="middle"
        fontFamily="Archivo, sans-serif"
        fontSize={r * 1.18}
        fontWeight="900"
        fill="#4A3405"
      >
        ẑ
      </text>
    </g>
  )
}

/** Black ETH-ish token, the raw input. */
function Fee({ x, y, r = 11 }: { x: number; y: number; r?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" r={r} fill="#0B0C0D" />
      <path d={`M0 ${-r * 0.62} L${r * 0.46} ${r * 0.1} L0 ${r * 0.42} L${-r * 0.46} ${r * 0.1} Z`} fill="#fff" opacity=".9" />
    </g>
  )
}

function StationLabel({ x, n, title, sub }: { x: number; n: string; title: string; sub: string }) {
  return (
    <g transform={`translate(${x} 526)`}>
      <text x="0" y="0" fontFamily="IBM Plex Mono, monospace" fontSize="12" fontWeight="600" fill={GREEN} letterSpacing="2">
        {n}
      </text>
      <text x="0" y="22" fontFamily="Archivo, sans-serif" fontSize="17" fontWeight="800" fill="#0C0D0E" letterSpacing="-.4">
        {title}
      </text>
      <text x="0" y="42" fontFamily="IBM Plex Mono, monospace" fontSize="11.5" fill="rgba(8,9,10,.5)">
        {sub}
      </text>
    </g>
  )
}

export function Foundry() {
  return (
    <div className="foundry-scroll">
      <svg viewBox="0 0 1300 584" className="foundry" role="img" aria-label="The Zeal Foundry: trading fees enter as ETH, are split, swapped into native ZEC, stored in a public reserve vault, and minted as zZEC on Robinhood Chain.">
        <defs>
          <linearGradient id="furnaceGlow" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={GOLD} stopOpacity=".95" />
            <stop offset="100%" stopColor="#FF6A00" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="vaultFill" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#C9930F" />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
          <clipPath id="vaultGlass">
            <rect x="838" y="212" width="128" height="176" rx="8" />
          </clipPath>
          <linearGradient id="floorFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0C0D0E" stopOpacity="0" />
            <stop offset="12%" stopColor="#0C0D0E" stopOpacity=".22" />
            <stop offset="88%" stopColor="#0C0D0E" stopOpacity=".22" />
            <stop offset="100%" stopColor="#0C0D0E" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* ---------- back wall ---------- */}
        <g opacity=".5">
          {Array.from({ length: 28 }).map((_, i) => (
            <line key={i} x1={20 + i * 48} y1="40" x2={20 + i * 48} y2="486" stroke="rgba(8,9,10,.06)" strokeWidth="1" />
          ))}
        </g>

        {/* ---------- 01 INTAKE ---------- */}
        <g>
          {/* overhead feed pipe */}
          <rect x="120" y="0" width="46" height="176" fill={PANEL} stroke={EDGE} strokeWidth="1.7" />
          <rect x="120" y="0" width="46" height="176" fill="none" stroke="rgba(8,9,10,.16)" strokeWidth="1" strokeDasharray="3 9" />
          {/* falling fees */}
          <g clipPath="none">
            <g className="drop drop-a"><Fee x={143} y={-20} /></g>
            <g className="drop drop-b"><Fee x={143} y={-20} /></g>
            <g className="drop drop-c"><Fee x={143} y={-20} /></g>
          </g>
          {/* hopper */}
          <path d="M96 176 h94 l-20 76 h-54 z" fill={PANEL_2} stroke={EDGE} strokeWidth="1.7" />
          <rect x="112" y="252" width="62" height="180" rx="4" fill={PANEL} stroke={EDGE} strokeWidth="1.7" />
          <rect x="124" y="272" width="38" height="12" rx="2" fill={GREEN} opacity=".85" className="flicker" />
          <text x="143" y="308" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10" fill="rgba(8,9,10,.55)">1.00%</text>
          <text x="143" y="326" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10" fill={GREEN}>×70%</text>
        </g>

        {/* ---------- 02 SPLITTER ---------- */}
        <g>
          <rect x="286" y="196" width="188" height="236" rx="6" fill={PANEL} stroke={EDGE} strokeWidth="1.7" />
          <rect x="286" y="196" width="188" height="34" rx="6" fill={PANEL_2} />
          <text x="380" y="219" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="11" fontWeight="600" fill="rgba(8,9,10,.72)" letterSpacing="2">
            SPLITTER
          </text>
          {SPLIT.map((s, i) => (
            <g key={s.key} transform={`translate(304 ${250 + i * 46})`}>
              <rect x="0" y="0" width="152" height="34" rx="3" fill="#0B0D0F" stroke={EDGE} strokeWidth="1" />
              <rect x="0" y="0" width={152 * (s.pct / 100)} height="34" rx="3" fill={GREEN} opacity={i === 0 ? 0.34 : 0.16} className={`bar bar-${i}`} />
              <text x="10" y="22" fontFamily="IBM Plex Mono, monospace" fontSize="11" fill="#F4F2EA">
                {s.label}
              </text>
              <text x="142" y="22" textAnchor="end" fontFamily="IBM Plex Mono, monospace" fontSize="12" fontWeight="600" fill={GREEN}>
                {s.pct}%
              </text>
            </g>
          ))}
        </g>

        {/* ---------- 03 FURNACE ---------- */}
        <g>
          {/* chimney + smoke */}
          <rect x="596" y="96" width="34" height="104" fill={PANEL_2} stroke={EDGE} strokeWidth="1.7" />
          <g className="smoke">
            <circle className="puff puff-a" cx="613" cy="90" r="11" fill="rgba(8,9,10,.13)" />
            <circle className="puff puff-b" cx="613" cy="90" r="14" fill="rgba(8,9,10,.09)" />
            <circle className="puff puff-c" cx="613" cy="90" r="9" fill="rgba(8,9,10,.15)" />
          </g>
          <rect x="540" y="200" width="210" height="232" rx="6" fill={PANEL} stroke={EDGE} strokeWidth="1.7" />
          {/* furnace mouth */}
          <path d="M576 412 h138 v-92 a69 46 0 0 0 -138 0 z" fill="#0A0B0C" stroke={EDGE} strokeWidth="1.2" />
          <path d="M576 412 h138 v-72 a69 40 0 0 0 -138 0 z" fill="url(#furnaceGlow)" className="burn" />
          <text x="645" y="232" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill="rgba(8,9,10,.55)">
            NEAR INTENTS
          </text>
          <text x="645" y="250" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fill={GREEN}>
            WETH → ZEC
          </text>
        </g>

        {/* ---------- 04 VAULT ---------- */}
        <g>
          <rect x="812" y="168" width="180" height="264" rx="8" fill={PANEL} stroke={EDGE} strokeWidth="1.7" />
          <rect x="812" y="168" width="180" height="30" rx="8" fill={PANEL_2} />
          <text x="902" y="189" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" fontWeight="600" fill="rgba(8,9,10,.7)" letterSpacing="2">
            RESERVE
          </text>
          {/* glass */}
          <rect x="838" y="212" width="128" height="176" rx="8" fill="#08090A" stroke={EDGE} strokeWidth="1.2" />
          <g clipPath="url(#vaultGlass)">
            <rect className="vault-level" x="838" y="316" width="128" height="72" fill="url(#vaultFill)" />
            <Coin x={868} y={352} r={11} />
            <Coin x={900} y={344} r={12} />
            <Coin x={934} y={354} r={11} />
            <Coin x={884} y={330} r={10} />
            <Coin x={918} y={326} r={11} />
            {/* fresh ZEC dropping in from the intake chute */}
            <g className="vdrop vdrop-a"><Coin x={888} y={200} r={11} /></g>
            <g className="vdrop vdrop-b"><Coin x={926} y={200} r={10} /></g>
          </g>
          <rect x="838" y="212" width="128" height="176" rx="8" fill="none" stroke="#0C0D0E" strokeWidth="1.6" />
          <line x1="838" y1="212" x2="966" y2="212" stroke="rgba(255,255,255,.28)" strokeWidth="1" />
          {/* dial */}
          <circle cx="902" cy="262" r="24" fill="none" stroke="rgba(255,255,255,.26)" strokeWidth="2" />
          <circle className="dial" cx="902" cy="262" r="24" fill="none" stroke={GREEN} strokeWidth="2.5" strokeDasharray="38 113" strokeLinecap="round" />
        </g>

        {/* ---------- 05 MINT PRESS ---------- */}
        <g>
          <rect x="1046" y="150" width="150" height="282" rx="6" fill={PANEL} stroke={EDGE} strokeWidth="1.7" />
          <rect x="1084" y="150" width="74" height="16" rx="3" fill={PANEL_2} stroke={EDGE} strokeWidth="1" />
          {/* ram */}
          <g className="ram">
            <rect x="1092" y="166" width="58" height="86" rx="3" fill={PANEL_2} stroke={EDGE} strokeWidth="1.2" />
            <rect x="1080" y="244" width="82" height="20" rx="3" fill={PANEL_2} stroke={EDGE} strokeWidth="1.4" />
          </g>
          {/* anvil */}
          <rect x="1068" y="300" width="106" height="18" rx="3" fill={PANEL_2} stroke={EDGE} strokeWidth="1.2" />
          <g className="stamped">
            <circle cx="1121" cy="290" r="15" fill="#0B0D0F" stroke={GREEN} strokeWidth="2" />
            <text x="1121" y="295" textAnchor="middle" fontFamily="Archivo, sans-serif" fontSize="13" fontWeight="900" fill={GREEN}>ẑ</text>
          </g>
          {/* output rack: finished zZEC stacking up */}
          <rect x="1062" y="336" width="118" height="66" rx="4" fill="#0B0D0F" stroke={EDGE} strokeWidth="1.7" />
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${1082 + i * 26} 372)`}>
              <circle cx="0" cy="0" r="10" fill="none" stroke={GREEN} strokeWidth="1.8" opacity={0.35 + i * 0.22} />
              <text x="0" y="4" textAnchor="middle" fontFamily="Archivo, sans-serif" fontSize="10" fontWeight="900" fill={GREEN} opacity={0.35 + i * 0.22}>ẑ</text>
            </g>
          ))}
          <text x="1121" y="352" textAnchor="middle" fontFamily="IBM Plex Mono, monospace" fontSize="10" fontWeight="600" fill={GREEN} letterSpacing="1.5">zZEC · 1:1</text>
        </g>

        {/* ---------- workers (behind the belt) ---------- */}
        <g className="crew">
          {/* feet land on the floor line at y=486, so torsos clear the belt at y=432 */}
          <Zebra pose="lever"   delay={0}    x={186}  y={486 - 118 * 1.32} w={118} />
          <Zebra pose="inspect" delay={0.7}  x={466}  y={486 - 106 * 1.32} w={106} hat="#0C0D0E" />
          <Zebra pose="haul"    delay={1.1}  x={618}  y={486 - 112 * 1.32} w={112} />
          <Zebra pose="hammer"  delay={0.2}  x={748}  y={486 - 120 * 1.32} w={120} flip />
          <Zebra pose="carry"   delay={0.45} x={982}  y={486 - 118 * 1.32} w={118} />
          <Zebra pose="cheer"   delay={0.9}  x={1188} y={486 - 96 * 1.32} w={96} hat="#0C0D0E" />
        </g>

        {/* ---------- conveyor ---------- */}
        <g>
          <rect x="30" y="432" width="1240" height="20" rx="10" fill="#0E1113" stroke={EDGE} strokeWidth="1.4" />
          <g className="belt-teeth">
            {Array.from({ length: 63 }).map((_, i) => (
              <rect key={i} x={40 + i * 20} y="438" width="8" height="8" rx="2" fill="rgba(255,255,255,.14)" />
            ))}
          </g>
          {/* rollers */}
          {[60, 300, 540, 800, 1060, 1240].map((x) => (
            <circle key={x} cx={x} cy="462" r="12" fill={PANEL_2} stroke={EDGE} strokeWidth="1.6" />
          ))}
        </g>

        {/* ---------- cargo on the belt ---------- */}
        <g className="cargo-lane">
          <g className="cargo cargo-1"><Fee x={0} y={420} /></g>
          <g className="cargo cargo-2"><Fee x={0} y={420} /></g>
          <g className="cargo cargo-3"><Coin x={0} y={418} r={12} /></g>
          <g className="cargo cargo-4"><Coin x={0} y={418} r={12} /></g>
        </g>

        {/* ---------- floor ---------- */}
        <line x1="0" y1="486" x2="1300" y2="486" stroke="url(#floorFade)" strokeWidth="1.7" />

        {/* ---------- labels ---------- */}
        <StationLabel x={96}   n="01" title="Intake"  sub="every trade pays in" />
        <StationLabel x={330}  n="02" title="Split"   sub="fixed allocation" />
        <StationLabel x={572}  n="03" title="Smelt"   sub="fees become real ZEC" />
        <StationLabel x={830}  n="04" title="Reserve" sub="public, auditable" />
        <StationLabel x={1060} n="05" title="Mint"    sub="1:1, backed" />
      </svg>
    </div>
  )
}
