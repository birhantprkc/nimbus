---
"@cloudflare/nimbus-docs": minor
---

Add OpenAPI-driven API reference support.

- New `api` config option (`ApiSpec[]`) mounts one or more OpenAPI 3.x specs (local file or inline object) as routed content collections.
- New `nimbus-docs/api` entry point turns a spec into a render-ready view model: `getApiModel`, `getApiPageSlugs`, `getApiPageProps` (operation/schema/section/api kinds), and `getApiNav`. Named unions, typed maps, and `allOf` are folded server-side; request/response samples are derived; descriptions render as sanitized Markdown.
- API pages join the agent surface: a per-page Markdown twin per operation, indexed into `/llms.txt`.
- Pairs with the `api-layout` registry recipe (`nimbus-docs add api-layout`) for the UI. `@scalar/openapi-parser` (required to build an API page) and the sample generators `openapi-sampler` + `@readme/httpsnippet` (optional) are optional peer deps installed by that recipe, so docs-only sites carry none.
- New `nimbus-docs/client` primitive `initDisclosureGroup` — expand/collapse-all plus hash deep-linking (auto-opens a linked field's ancestors and scrolls to it) for a group of native `<details>`, reduced-motion aware. Used by the `api-field-row` recipe's filetree field explorer.
- New `nimbus-docs/client` primitives `readUrlParam`/`writeUrlParam` — read a query param (recovering one stranded in the fragment of a pasted `#anchor?key=value` URL) and write one back via `history.replaceState`, preserving the anchor, any other params, and history state. Used by the `api-code-rail` recipe's `?lang=` sample deep-linking.
- Coordinate citations: cite API operations from prose with `[text](api.ref:<collection>:<coordinate>)`, resolved to canonical URLs at build across HTML, `.md` twins, and the corpus. An unresolved citation into a known collection fails the build; an unknown collection degrades to `#` with a warning.
- New `apiReferences[]` config folds a remote site's published manifest into the resolver for cross-repo citations. New `getCoordinatesManifest()` publishes this site's manifest and `getEntryMarkdown()` renders entries with citations resolved. `renderEntryAsMarkdown` now requires a citation index when the body has citations.
- Every declared request-body media type renders — no content type is silently dropped. The primary media keeps the short-form coordinate (`op.<field>`); each additional media (e.g. `multipart/form-data`, `application/octet-stream`) becomes its own media section under a token segment (`op.<media>.<field>`) whose fields stay fully citable, with the primary chosen order-independently. Media labels are honest (the media subtype, never a hardcoded `JSON`), and a fieldless scalar body still surfaces its affordance and example.
