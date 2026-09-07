# ZEAL standing project instructions

## Build log and documentation — user requirement

Whenever making a meaningful ZEAL ecosystem change, update both the public build log and the relevant documentation as part of the same work. This applies to the website, zZEC operations, contracts, liquidity, redemption, wrapping and zealz.fun. The user explicitly requested this on September 7, 2026; it persists across sessions.

- Public build log: `/Users/kyle/zeal/zealtoken.com/src/sections/Close.tsx` (`LOG` entries and the appropriate `DAYS` summary).
- Public docs: `/Users/kyle/zeal/zealtoken.com/src/docs/content/`. Update the pages explaining the changed behavior; do not substitute a generic changelog entry for accurate documentation.
- Describe what changed, why it matters and its actual status. Distinguish built, tested, preview, deployed and activated. Record dates and evidence links where available. Never label planned or merely tested financial functionality live.
- For contract or operational changes, document changed limits, trust assumptions, recovery procedures and user actions where relevant. Do not publish credentials, private operational details or secrets.
- Keep historical entries intact; add a new dated entry for meaningful changes. Avoid repetitive entries for trivial formatting changes or a documentation-only synchronization.
- Include the log and docs in the normal build/verification and publication workflow. If publication is blocked, say so explicitly; do not claim the public docs are updated.
- Before finishing, check that implementation, public copy, docs and build-log status agree. Mention material documentation updates in the completion message.
