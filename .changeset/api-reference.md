---
"@cloudflare/nimbus-docs": minor
---

Add OpenAPI-driven API reference support. A new `api` config option (`ApiSpec[]`) mounts one or more OpenAPI 3.x specs — a local file or an inline object — as routed content collections. The new `nimbus-docs/api` entry point turns a spec into a render-ready view model: `getApiModel`, `getApiPageSlugs` (static paths), `getApiPageProps` (per-page props for operation/schema/section/api kinds), and `getApiNav` (the reference nav tree). Named unions, typed maps, and `allOf` are folded server-side, request/response code samples are derived, and OpenAPI descriptions render as sanitized Markdown.

API pages join the agent surface: `loadApiCollections` and `renderIndexedEntryMarkdown` emit a per-page Markdown twin for every operation and index them into `/llms.txt`, matching prose docs.

Pairs with the `api-reference` registry recipe (`nimbus-docs add api-reference`) for the UI; the bundled registry index describes each `api-*` component as it ships. Adds `@scalar/openapi-parser` and `openapi-sampler` as dependencies.
