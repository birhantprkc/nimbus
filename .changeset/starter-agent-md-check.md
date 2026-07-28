---
"@cloudflare/create-nimbus-docs": patch
---

Point the scaffolded AGENT.md at `nimbus-docs check`

The generated `AGENT.md` now documents the one-command model: a "Check it builds" row in the actions table, and an "Audit this site" section that leads with `nimbus-docs check --json` (config validity, `site` placeholder, route collisions, MDX component resolution, lint rules — build-free) before the manual walk of what `check` doesn't cover yet (route-file existence, registry hygiene, AI surface, post-build search, Cloudflare config).
