/**
 * The Zeal workforce.
 *
 * One rigged zebra body drawn in flat vector, with named limb groups so a
 * pose is just a CSS animation applied to `.arm-l` / `.arm-r` / `.torso`.
 * That keeps every worker on the same model sheet while letting a whole
 * factory floor do different jobs.
 */

export type Pose = 'carry' | 'hammer' | 'lever' | 'inspect' | 'haul' | 'idle' | 'cheer'

const CREAM = '#F4F2EA'
const CREAM_SHADE = '#DEDBD0'
const STRIPE = '#0C0D0E'

type Props = {
  pose?: Pose
  /** Hard hat colour. `null` removes the hat. */
  hat?: string | null
  /** Seconds of delay so a crowd doesn't move in lockstep. */
  delay?: number
  /** Mirror horizontally. */
  flip?: boolean
  className?: string
  style?: React.CSSProperties
  title?: string
  /** Placement when nested inside another SVG. `w` sets width; height follows the 100:132 ratio. */
  x?: number
  y?: number
  w?: number
}

let uid = 0

export function Zebra({
  pose = 'idle',
  hat = '#00C805',
  delay = 0,
  flip = false,
  className = '',
  style,
  title,
  x,
  y,
  w,
}: Props) {
  const id = `z${uid++}`
  return (
    <svg
      viewBox="0 0 100 132"
      x={x}
      y={y}
      width={w}
      height={w === undefined ? undefined : w * 1.32}
      className={`zebra pose-${pose} ${className}`}
      style={{
        ...style,
        ['--delay' as string]: `${delay}s`,
        ...(flip ? { transform: `scaleX(-1) ${style?.transform ?? ''}` } : null),
      }}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`${id}-body`}>
          <rect x="24" y="60" width="52" height="50" rx="23" />
        </clipPath>
        <clipPath id={`${id}-head`}>
          <rect x="19" y="12" width="62" height="56" rx="27" />
        </clipPath>
      </defs>

      {/* ground shadow */}
      <ellipse cx="50" cy="127" rx="27" ry="4.5" fill="rgba(8,9,10,.14)" />

      <g className="torso">
        {/* legs */}
        <rect className="leg leg-l" x="31" y="98" width="15" height="28" rx="7.5" fill={STRIPE} />
        <rect className="leg leg-r" x="54" y="98" width="15" height="28" rx="7.5" fill={STRIPE} />

        {/* far arm */}
        <rect className="arm arm-r" x="70" y="64" width="13" height="34" rx="6.5" fill={STRIPE} />

        {/* body */}
        <g>
          <rect x="24" y="60" width="52" height="50" rx="23" fill={CREAM} stroke={STRIPE} strokeWidth="3" />
          <g clipPath={`url(#${id}-body)`}>
            <path d="M27 72 q13 5 27 1 q11 -3 20 -1" stroke={STRIPE} strokeWidth="3.6" fill="none" strokeLinecap="round" />
            <path d="M25 86 q15 6 30 1 q11 -3 20 0" stroke={STRIPE} strokeWidth="3.2" fill="none" strokeLinecap="round" />
            <path d="M28 100 q13 4 24 1" stroke={STRIPE} strokeWidth="2.8" fill="none" strokeLinecap="round" />
            <ellipse cx="76" cy="86" rx="10" ry="26" fill={CREAM_SHADE} opacity=".5" />
          </g>
          {/* belly badge */}
          <circle cx="50" cy="93" r="7.5" fill={STRIPE} opacity=".9" />
          <text
            x="50"
            y="96.8"
            textAnchor="middle"
            fontFamily="Archivo, sans-serif"
            fontSize="9.5"
            fontWeight="900"
            fill={CREAM}
          >
            Z
          </text>
        </g>

        {/* near arm */}
        <rect className="arm arm-l" x="17" y="64" width="13" height="34" rx="6.5" fill={STRIPE} />

        {/* head */}
        <g className="head">
          {/* ears */}
          <ellipse cx="25" cy="18" rx="8" ry="11" fill={CREAM} stroke={STRIPE} strokeWidth="2.6" transform="rotate(-22 25 18)" />
          <ellipse cx="25" cy="19" rx="4" ry="6" fill="#E9A0A6" transform="rotate(-22 25 19)" />
          <ellipse cx="75" cy="18" rx="8" ry="11" fill={CREAM} stroke={STRIPE} strokeWidth="2.6" transform="rotate(22 75 18)" />
          <ellipse cx="75" cy="19" rx="4" ry="6" fill="#E9A0A6" transform="rotate(22 75 19)" />

          {/* mane */}
          <path
            d="M38 14 q3 -11 7 -12 q1 7 4 9 q2 -12 6 -13 q1 8 4 10 q3 -10 6 -10 q2 6 2 14 z"
            fill={STRIPE}
          />

          <rect x="19" y="12" width="62" height="56" rx="27" fill={CREAM} stroke={STRIPE} strokeWidth="3" />

          <g clipPath={`url(#${id}-head)`}>
            {/* forehead + cheek stripes */}
            <path d="M44 11 q2 7 -1 11" stroke={STRIPE} strokeWidth="3.4" fill="none" strokeLinecap="round" />
            <path d="M53 10 q3 6 1 10" stroke={STRIPE} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M24 30 q6 2 9 5" stroke={STRIPE} strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M23 40 q6 1 9 3" stroke={STRIPE} strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M76 30 q-6 2 -9 5" stroke={STRIPE} strokeWidth="3.5" fill="none" strokeLinecap="round" />
            <path d="M77 40 q-6 1 -9 3" stroke={STRIPE} strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>

          {/* eyes */}
          <g className="eyes">
            <ellipse cx="37" cy="38" rx="6.2" ry="7" fill={STRIPE} />
            <ellipse cx="63" cy="38" rx="6.2" ry="7" fill={STRIPE} />
            <circle cx="39" cy="35.5" r="2.1" fill="#fff" />
            <circle cx="65" cy="35.5" r="2.1" fill="#fff" />
          </g>

          {/* muzzle */}
          <ellipse cx="50" cy="55" rx="18" ry="12.5" fill={STRIPE} />
          <ellipse cx="44" cy="51" rx="2.2" ry="3" fill="rgba(255,255,255,.32)" />
          <ellipse cx="56" cy="51" rx="2.2" ry="3" fill="rgba(255,255,255,.32)" />

          {hat && (
            <g className="hat">
              <path d="M26 21 q24 -27 48 0 z" fill={hat} stroke={STRIPE} strokeWidth="2.4" strokeLinejoin="round" />
              <rect x="20" y="19" width="60" height="6.5" rx="3.2" fill={hat} stroke={STRIPE} strokeWidth="2.2" />
              <path d="M46 1 q4 -1 8 0 l1 17 h-10 z" fill="rgba(0,0,0,.18)" />
            </g>
          )}
        </g>
      </g>
    </svg>
  )
}

/** A gold ZEC coin, used as cargo throughout the factory. */
export function ZecCoin({
  size = 32,
  className = '',
  style,
}: {
  size?: number
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} style={style} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#B47C09" />
      <circle cx="24" cy="22.5" r="21" fill="#F4B728" />
      <circle cx="24" cy="22.5" r="17" fill="none" stroke="#C9930F" strokeWidth="1.6" />
      <path
        d="M17 12h14v4l-9 12h9v4H17v-4l9-12h-9z"
        fill="#4A3405"
      />
      <path d="M23 7.5h2.6v5h-2.6zM23 32.5h2.6v5h-2.6z" fill="#4A3405" />
    </svg>
  )
}

/** An ETH/fee token — what arrives at the factory door. */
export function FeeToken({ size = 26, style }: { size?: number; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={style} aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="#0C0D0E" stroke="rgba(255,255,255,.35)" strokeWidth="1.5" />
      <path d="M24 9l9 15-9 5-9-5z" fill="#fff" opacity=".92" />
      <path d="M24 31.5l9-5.2-9 12.7-9-12.7z" fill="#fff" opacity=".62" />
    </svg>
  )
}
