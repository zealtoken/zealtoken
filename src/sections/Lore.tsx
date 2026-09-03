import { LORE } from '../config'
import { stagger } from '../useReveal'

/**
 * Where the name comes from. One post, quoted and linked, nothing invented.
 */
export function Lore() {
  return (
    <section className="band band-tint" id="lore">
      <div className="wrap split lore-split">
        <div>
          <p className="eyebrow" data-reveal>
            Lore
          </p>
          <h2 className="h2" data-reveal style={stagger(1)}>
            A zeal is
            <br />
            a group of zebras.
          </h2>
          <p className="lede" data-reveal style={stagger(2)}>
            The name is not ours. The Zcash Foundation picked its mascot on stage at {LORE.event} in 2019,
            and the pun stuck. Zebra is the Foundation's node software; enough zebras make a zeal.
          </p>
        </div>

        <a
          className="tweet"
          href={LORE.tweetUrl}
          target="_blank"
          rel="noreferrer"
          data-reveal="left"
          style={stagger(2, 90)}
          aria-label={`Open the original post by ${LORE.handle} on X`}
        >
          <div className="tweet-head">
            <span className="tweet-avatar" aria-hidden="true">Z</span>
            <span className="tweet-who">
              <strong>{LORE.author}</strong>
              <span className="mono">{LORE.handle}</span>
            </span>
            <span className="tweet-x" aria-hidden="true">𝕏</span>
          </div>
          <p className="tweet-text">{LORE.text}</p>
          <p className="tweet-credit mono">{LORE.credit} · #{LORE.event}</p>
          <img className="tweet-img" src={LORE.image} alt="A zeal of zebras, posted by the Zcash Foundation at Zcon1" loading="lazy" />
          <div className="tweet-foot mono">
            <span>{LORE.date}</span>
            <span className="tweet-open">Open on X →</span>
          </div>
        </a>
      </div>
    </section>
  )
}
