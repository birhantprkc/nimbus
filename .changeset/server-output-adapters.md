---
"@cloudflare/nimbus-docs": minor
---

Add server-output support and the `@cloudflare/nimbus-docs/adapters` export.

Nimbus can now target on-request (server) output in addition to static. A new `@cloudflare/nimbus-docs/adapters` public export ships the adapter recipes plus the shared `astro.config` and `wrangler.jsonc` emitters, and two new CLI verbs opt an existing site in: `nimbus-docs add server-output --adapter <vercel|node|netlify|cloudflare>` (alias `nimbus-docs add adapter-<id>`). The installer rewrites `astro.config` at the `// nimbus:adapter` marker and, for Cloudflare, creates a server `wrangler.jsonc` or replaces an exact Nimbus static config. Custom and alternate Wrangler configs are preserved with manual adaptation instructions.

Withdraw the `gated` config option because it did not hold as a confidentiality boundary. Existing `gated` config now fails with a migration error; to keep a page out of the build, move the page out of a routed content collection.

Fix env preflight precedence and parsing to match Vite, including empty shell overrides, last-wins `.env*` files, and inline dotenv comments. Adapter dependency validation now resolves pnpm catalog declarations, and compatibility warnings reflect the versions installed by the command.

Fix `NimbusHead` URLs for sub-path deployments by applying Astro's configured base to sitemap, LLM index, social image, JSON-LD, canonical, and version-alternate URLs. Root deployments and already-based paths are unchanged.
