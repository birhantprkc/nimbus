---
"@cloudflare/nimbus-docs": patch
---

- Honor `noindex: true` on machine discovery surfaces. `noindex` pages now drop out of `/llms.txt`, per-section `llms.txt`, and the `/llms-full.txt` corpus (matching on-site search, which already excluded them) while staying directly addressable and navigable. A single exported `isDiscoverable` predicate defines the contract for custom index/corpus routes.
- Pin `@vercel/detect-agent` to `1.2.3`, the last release published with npm provenance. Versions `1.2.4`/`1.2.5` dropped provenance, tripping pnpm's `ERR_PNPM_TRUST_DOWNGRADE` and blocking lockfile updates. Pinning holds at the attested artifact until upstream restores provenance.
- Fix navigation for pages under CJK (percent-encoded) paths. Route matching now decodes percent-encoded request paths (`toRouteKey`), so active sidebar state, breadcrumbs, and prev/next resolve correctly instead of falling back to a URL-encoded trail; the breadcrumb URL fallback also decodes segment labels.
