---
"@cloudflare/create-nimbus-docs": patch
---

Stop scaffolds from stripping the `// nimbus:adapter` marker from `astro.config.ts`.

`applyDeployTarget` deleted the marker from every generated project (both the `cloudflare` and `other` deploy targets), so `nimbus-docs add adapter-*` could never find its anchor and failed with "Couldn't find the `// nimbus:adapter` marker" — breaking the server-output opt-in for every scaffolded site. The unit tests missed it because their fixtures hard-code the marker rather than exercising the shipped template.

The marker is now preserved as the documented anchor the adapter installer rewrites. A new generator test asserts every emitted variant keeps it, closing the fixture-vs-shipped-template gap.
