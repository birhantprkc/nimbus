---
"@cloudflare/create-nimbus-docs": patch
---

Stop shipping the `.nimbus/` build directory into scaffolded projects

`.nimbus/` holds build artifacts materialized by `astro build` (`routes.json`, `lint.json`). It had leaked into the starter source and was being copied into new projects, so a freshly scaffolded app carried stale route and lint truth from the template rather than its own. `.nimbus` is now excluded by both the template-copy script and the runtime scaffolder, and removed from the starter source; a new project starts with no build artifacts and generates its own on first build.
