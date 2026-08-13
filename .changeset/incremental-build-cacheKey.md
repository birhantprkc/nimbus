---
"@cloudflare/nimbus-docs": minor
---

`getDocsStaticPaths` and `getCollectionStaticPaths` now include a `cacheKey` (derived from the entry's `digest`) on each returned path. This enables Astro's experimental incremental build cache to skip re-rendering unchanged pages. No-op when `experimental.incrementalBuild` is not enabled in `astro.config.ts`.
