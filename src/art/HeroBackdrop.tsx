import { useEffect, useRef, useState } from 'react'

/**
 * The HQ scene behind the hero. Plays at full opacity on the right and fades
 * to paper on the left, so the headline and lede always sit on a near-solid
 * white and the readability numbers hold. Reduced-motion and Save-Data
 * visitors get the still.
 */
export function HeroBackdrop() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stillOnly, setStillOnly] = useState(false)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection
    if (reduced || conn?.saveData) setStillOnly(true)
  }, [])

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.setAttribute('muted', '')
    void v.play().catch(() => {})
    const onVis = () => (document.visibilityState === 'visible' ? void v.play().catch(() => {}) : v.pause())
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [stillOnly])

  return (
    <div className="hero-bg" aria-hidden="true">
      <img
        className="hero-bg-still"
        src="/video/hero-poster-sm.webp"
        srcSet="/video/hero-poster-sm.webp 800w, /video/hero-poster.webp 1600w"
        sizes="100vw"
        alt=""
        width={1600}
        height={906}
        decoding="async"
        fetchPriority="low"
      />
      {!stillOnly && (
        <video
          ref={videoRef}
          className={`hero-bg-video ${playing ? 'is-playing' : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster="/video/hero-poster.webp"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
        >
          <source src="/video/hero-1100.mp4" media="(max-width: 720px)" type="video/mp4" />
          <source src="/video/hero-1600.mp4" type="video/mp4" />
        </video>
      )}
      <div className="hero-wash" />
    </div>
  )
}
