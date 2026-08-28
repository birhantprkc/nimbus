---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": minor
---

Add first-party OpenAPI reference support to Nimbus.

- Configure local or inline OpenAPI specs as routed, version-aware collections with operations, schemas, tags, webhooks, generated samples, and every declared request-body media type.
- Install an editable `api-layout` UI that shares Nimbus's docs shell, navigation, breadcrumbs, banners, mobile behavior, and deep-linkable field and code-sample controls. The copied `ApiFieldList` field iterator is explicitly typed so the scaffolded UI type-checks cleanly under a consumer's strict TypeScript.
- Publish per-page Markdown, agent indexes, corpus entries, coordinate manifests, and `api.ref:` citations across local and cross-site documentation.
- Harden generated-consumer delivery with exact registry dependencies, working pnpm installs from scaffold roots, and base-aware canonical, Markdown, sitemap, and agent URLs through the new public `withBase` helper.
- Control how operation pages are addressed, and stay resilient to messy specs. By default, operations that lack a usable `operationId` no longer abort the build — they warn and fall back to a path-derived coordinate, so real-world specs (e.g. Cloudflare's `brand-protection` operations) build; set `api[].requireOperationId: true` on specs you own to keep that fatal, while route-hostile paths and coordinate collisions stay fatal regardless. For readable, path-derived URLs, opt into the `resource-action-v1` route convention: set `api[].routes: { convention: "resource-action-v1" }` (per version in a family) to derive slugs like `charges/list` from an operation's method and path, decoupled from `operationId` so route-hostile identifiers no longer poison URLs. Trim shared bases with `stripPathPrefixes` (e.g. `["/v1"]`), pin individual pages with an `operations` (`operationId` → slug) map, and inspect how each slug resolved (`override` / `derived` / `fallback`) via the new `getApiRouteProvenance` export. Derivation collisions, reserved-route segments, unused overrides, cross-version slug drift, and unknown config keys (e.g. a `stripPrefixes` typo for `stripPathPrefixes`) are reported with pointed messages; the default (no `routes`) keeps the legacy `operationId` slugs unchanged.
