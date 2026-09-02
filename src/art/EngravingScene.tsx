import { useEffect, useRef, useState } from 'react'

/**
 * A full-width engraved plate that plays as a silent loop.
 *
 * Shown whole at its native aspect ratio: the artwork carries its own labels,
 * so nothing is ever cropped, faded or framed.
 *
 * Costs are managed rather than assumed. The poster paints immediately and the
 * video only attaches once the plate is near the viewport, so it never competes
 * with the hero for bandwidth. Playback pauses when scrolled away. Reduced-motion
 * and Save-Data visitors get the still and nothing else.
 */

type Props = {
  srcSmall: string
  srcLarge: string
  poster: string
  posterSmall?: string
  alt: string
  /** Native aspect ratio, e.g. '1920 / 1088'. */
  ratio: string
  /** Intrinsic poster size, for layout stability before it loads. */
  width: number
  height: number
}

export function EngravingScene({
  srcSmall,
  srcLarge,
  poster,
  posterSmall,
  alt,
  ratio,
  width,
  height,
}: Props) {
  const hostRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

  const [shouldLoad, setShouldLoad] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [stillOnly, setStillOnly] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const conn = (navigator as { connection?: { saveData?: boolean } }).connection
    if (reduced || conn?.saveData) setStillOnly(true)
  }, [])

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
            /* autoplay refused: the poster stays, which is a fine outcome */
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
   * iOS Safari reads the attribute when deciding whether inline autoplay is
   * allowed. Without this the loop silently refuses to start on iPhone.
   */
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.setAttribute('muted', '')
    void v.play().catch(() => {})
  }, [shouldLoad])

  return (
    <figure className="scene" ref={hostRef} style={{ ['--ratio' as string]: ratio }}>
      <img
        className="scene-still"
        src={posterSmall ?? poster}
        srcSet={posterSmall ? `${posterSmall} 800w, ${poster} 1600w` : undefined}
        sizes="100vw"
        alt={alt}
        width={width}
        height={height}
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
    </figure>
  )
}
