---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": patch
---

Bake Markdown twins, MDX twins, LLM corpora, and merged partial headings into deterministic build artifacts. Request-rendered pages now consume compact prepared heading data, custom partial resolvers run through revisioned build configuration, and Worker bundles no longer include partial-expansion parsers. Calls to `renderEntryAsMarkdown` or `getEntryMarkdown` that still pass `<Render>` partials now fail instead of attempting runtime expansion; migrate custom Markdown routes to the prepared twin helpers exported by `@cloudflare/nimbus-docs/build`.

Keep framework assets, metadata, starter navigation, and generated API links inside Astro's configured deployment base path. Replace the removed `withBaseRoute` runtime export with `withBase`; site-relative inputs to `withBase` must be logical, unbased paths.
