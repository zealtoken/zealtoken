import { useEffect, useRef, useState } from 'react'

/**
 * A full-bleed engraved plate that plays as a silent loop.
 *
 * Costs are managed rather than assumed:
 *  - the poster paints immediately; the video is only attached once the band is
 *    near the viewport, so it never competes with the hero for bandwidth
 *  - playback pauses when scrolled away, so it isn't burning a laptop battery
 *    three sections up the page
 *  - reduced-motion and Save-Data users get the still plate and nothing else
 */

type Props = {
  /** Sources, largest last — the small one is served to narrow viewports. */
  srcSmall: string
  srcLarge: string
  poster: string
  posterSmall?: string
  alt: string
  caption?: string
  /** CSS object-position, for choosing what survives the crop. */
  focus?: string
  /**
   * 'band'  — full-bleed, cropped to a cinematic strip.
   * 'plate' — contained and shown whole, for frames with baked-in labels that
   *           must not be cropped away.
   */
  variant?: 'band' | 'plate'
  /** Native aspect ratio, e.g. '1920 / 1088'. Only used by 'plate'. */
  ratio?: string
}

export function EngravingScene({
  srcSmall,
  srcLarge,
  poster,
  posterSmall,
  alt,
  caption,
  focus = 'center 58%',
  variant = 'band',
  ratio,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [shouldLoad, setShouldLoad] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [stillOnly, setStillOnly] = useState(false)

  // Decide once whether this visitor should get motion at all.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection
    if (reduced || conn?.saveData) setStillOnly(true)
  }, [])

  // Attach the video only when the band is close, then play/pause with visibility.
  useEffect(() => {
    const host = hostRef.current
    if (!host || stillOnly) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setShouldLoad(true)

        const v = videoRef.current
        if (!v) return
        if (entry.isIntersecting) {
          void v.play().catch(() => {
            /* autoplay refused — the poster stays, which is a fine outcome */
          })
        } else {
          v.pause()
        }
      },
      { rootMargin: '300px 0px' },
    )

    io.observe(host)
    return () => io.disconnect()
  }, [stillOnly])

  /**
   * React assigns `muted` as a DOM property but never writes the attribute, and
   * iOS Safari reads the *attribute* when deciding whether inline autoplay is
   * allowed. Without this the loop silently refuses to start on iPhone and the
   * poster is all anyone ever sees.
   */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    v.muted = true
    v.setAttribute('muted', '')
    void v.play().catch(() => {})
  }, [shouldLoad])

  return (
    <figure
      className={`scene scene-${variant}`}
      ref={hostRef}
      style={{
        ['--focus' as string]: focus,
        ...(ratio ? { ['--ratio' as string]: ratio } : null),
      }}
    >
      <img
        className="scene-still"
        src={posterSmall ?? poster}
        srcSet={posterSmall ? `${posterSmall} 800w, ${poster} 1600w` : undefined}
        sizes="100vw"
        alt={alt}
        width={1600}
        height={900}
        loading="lazy"
        decoding="async"
      />

      {shouldLoad && !stillOnly && (
        <video
          ref={videoRef}
          className={`scene-video ${playing ? 'is-playing' : ''}`}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={poster}
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
        >
          <source src={srcSmall} media="(max-width: 720px)" type="video/mp4" />
          <source src={srcLarge} type="video/mp4" />
        </video>
      )}

      <div className="scene-veil" aria-hidden="true" />
      {caption && <figcaption className="scene-cap mono">{caption}</figcaption>}
    </figure>
  )
}
