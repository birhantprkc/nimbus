---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": minor
---

Add server and request rendering for canonical content collections.

Nimbus now supports collection-level build and request rendering policies with validated defaults and per-collection overrides. Request-rendered prose and API routes use response-aware page helpers, prepared API models, request-safe partial headings, 404 responses, and build-derived syntax-highlighting assets without shipping source OpenAPI specs to Workers.

Add the `@cloudflare/nimbus-docs/adapters` export and CLI commands for opting existing projects into Astro server output. The marker-scoped installer wires supported adapters without replacing project-owned rendering policy, saves exact resolved adapter versions, handles pnpm catalogs, emits compatible Wrangler configuration, and provides an agent-ready Cloudflare rendering recipe. It also improves environment preflight behavior, base-path metadata URLs, adapter compatibility diagnostics, and removes the unsafe `gated` configuration option.

Add scaffolder support for selecting server output and an adapter. Cloudflare server scaffolds enable request rendering by default and include pnpm architecture configuration for Satteri's WASI fallback. Static scaffolds retain the adapter marker, platform artifacts are ignored, copied templates and destinations are protected against symlink escapes, and generated components remain compatible with adapter-defined `Astro.locals` types.

Preserve sitemap, Pagefind, Markdown, and agent-index discovery for request-rendered routes. Pin the tested sitemap integration, clean up synthetic Pagefind staging files transactionally, and generate cross-collection Open Graph images in new starters.
