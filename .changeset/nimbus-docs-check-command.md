---
"@cloudflare/nimbus-docs": minor
---

Add `nimbus-docs check` — a build-free preflight

One command a human, CI, or agent runs to catch setup, structural, and authoring problems before a build. It runs three categories — environment (Node floor, config locatable, `site` not a placeholder, pagefind, wrangler), structure (config Zod, duplicate routes, MDX component resolution — the same validators the build gates on), and authoring (the shipped lint rules) — and normalizes every result into one finding envelope.

- `--json` emits `{ ok, summary{errors,warnings,fixable,durationMs}, findings[{scope,code,severity,file,line,message,fixable,fix}] }`, so an agent's loop is `check --json` → apply each `fix` → re-run.
- `--fix` applies safe fixes (installs, config rewrites via a static parse of `astro.config.ts`), prompting on a TTY for values it can't invent (e.g. the production `site` URL) and skipping them headless.
- `--env` / `--structure` / `--lint` run a single category; exit codes are `0` clean · `1` findings · `2` usage.
- `init` now ends with the env readiness pass, so a fresh scaffold hears about a placeholder `site` at setup time.

`lint` is preserved as a first-class command; `check --lint` runs the same rules inside the preflight envelope.

Config validation for `site` is now stricter: it must be an absolute `http(s)://` URL with a host. Previously a value missing the `//` (e.g. `https:example.com`) slipped through `new URL()` and shipped a broken canonical origin; it is now rejected both build-free by `check` and at build time by the config gate.
