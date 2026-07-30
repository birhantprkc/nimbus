---
"@cloudflare/create-nimbus-docs": patch
---

Point the scaffolded AGENT.md at `nimbus-docs check`

The generated `AGENT.md` now documents the one-command model: a "Check it builds" row in the actions table (env + structure + authoring + types), and an "Audit this site" section that leads with `nimbus-docs check --json` before the manual walk of what `check` doesn't cover yet (route-file existence, registry hygiene, AI surface, post-build search, Cloudflare config).

It teaches an agent the honest result contract: the primary signals are `status` (passed|failed|partial) and `readiness` (buildable|blocked|unknown), with `ok` kept only for back-compat; a check that couldn't be evaluated yet (e.g. types before a build) is a `note` under `scopes[].notes[]` — never a finding, never a `fix` — so the fix loop terminates on `status !== "failed" && summary.fixable === 0` rather than spinning on a coverage gap it cannot repair.
