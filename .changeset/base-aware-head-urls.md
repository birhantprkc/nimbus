---
"@cloudflare/nimbus-docs": patch
---

Fix `NimbusHead` emitting base-less SEO URLs on sub-path deployments (e.g. `base: '/docs'`).

`new URL(path, Astro.site)` resolves against the origin only and drops the configured `base`, so the `rel=sitemap` link, the LLM-index `rel=alternate`, `og:image`/`twitter:image`, the JSON-LD `isPartOf.url`, the versioned `canonical`, and the cross-version `rel=alternate` all pointed at the origin root and 404'd under a sub-path. Every internal path handed to `new URL(..., Astro.site)` is now `base`-prefixed via a `withBase` helper, matching the existing `BASE_URL` handling for the favicon and Shiki stylesheet.

Root deployments (`base: '/'`) are unaffected: the helper is a no-op when no base is configured, and already-based paths pass through unchanged (idempotent).
