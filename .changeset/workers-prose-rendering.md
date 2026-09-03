---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": minor
---

Add Cloudflare request rendering for canonical content collections.

Nimbus now supports collection-level build and request rendering policies with validated defaults and per-collection overrides. Request-rendered prose and API routes use response-aware page helpers, prepared API models, request-safe partial headings, 404 responses, and build-derived syntax-highlighting assets without shipping source OpenAPI specs to Workers. Cloudflare server scaffolds enable request rendering by default, and generated pnpm configuration installs Satteri's WASI fallback alongside the current architecture.

Preserve sitemap, Pagefind, Markdown, and agent-index discovery for request-rendered routes. Pin the tested sitemap integration, clean up synthetic Pagefind staging files transactionally, and generate cross-collection Open Graph images in new starters.
