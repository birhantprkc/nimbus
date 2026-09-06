---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": patch
---

Generate deterministic Markdown versions for every public page, prepared MDX source versions for authored pages, `llms.txt` indexes, `llms-full.txt`, and merged partial headings at build time. Request-rendered pages now consume compact prepared heading data, and custom component transforms and partial resolvers are configured through `markdown.componentMap` and `markdown.partialResolver`. Worker bundles no longer include partial-expansion parsers. Calls to `renderEntryAsMarkdown` or `getEntryMarkdown` that still pass `<Render>` partials now fail instead of attempting runtime expansion; migrate custom Markdown routes to the prepared helpers exported by `@cloudflare/nimbus-docs/build`.

Rename prepared publication APIs without compatibility aliases: `TwinSurface` becomes `PreparedMarkdownSurface`, `PreparedTwin*` becomes `PreparedMarkdown*`, `PreparedCorpus*` becomes `PreparedLlms*`, `getPreparedTwin*` becomes `getPreparedMarkdown*`, `getPreparedCorpus*` becomes `getPreparedLlms*`, and `renderCorpusMarkdown` becomes `renderLlmsFullMarkdown`. Move integration customization from `twins.componentMap` and `twins.partialResolver` to `markdown.componentMap` and `markdown.partialResolver`.

Keep framework assets, metadata, starter navigation, and generated API links inside Astro's configured deployment base path. Replace the removed `withBaseRoute` runtime export with `withBase`; site-relative inputs to `withBase` must be logical, unbased paths.

Keep generated `.nimbus` build data out of source control, deduplicate sitemap roots on subpath deployments, and advertise prepared MDX source responses as `text/mdx` consistently across static and request rendering.
