---
"@cloudflare/nimbus-docs": minor
---

Add `nimbus-docs check` — a build-free preflight that reports readiness honestly

One command a human, CI, or agent runs to catch setup, structural, authoring, and type problems before a build. It runs four categories — environment (Node floor, config locatable, `site` not a placeholder, pagefind, wrangler), structure (config Zod, duplicate routes, MDX component resolution — the same validators the build gates on), authoring (the shipped lint rules), and types (a build-free type-check) — and normalizes every result into one envelope.

The types category type-checks your TypeScript with your project's own `tsc`, build-free — no `astro build`, no `astro sync`, nothing spawned (your TypeScript is resolved from your project, never bundled into the CLI). Astro transpiles rather than type-checks, so a type error never fails the build on its own; catching it in the preflight is the point. Because `tsc` can't parse `.astro` SFCs, their internals and prop types are out of scope (that needs `astro check`); an injected ambient `declare module "*.astro"` keeps `.ts` files that import `.astro` components from being false-flagged.

**The report separates two axes that a naive error count fuses: buildability vs. correctness, and evaluated vs. not-evaluated.** `--json` carries three top-level signals:

- **`status`** (`passed` | `failed` | `partial`) — the whole-run verdict across every scope that ran.
- **`readiness`** (`buildable` | `blocked` | `unknown`) — derived from env + structure only: does the project clear Nimbus' buildability checks? A type error is `status: failed` but `readiness: buildable` (the site still builds — Astro strips types); a placeholder `site` is `blocked`.
- **`ok`** — kept for back-compat, still exactly `errors === 0`.

Exit is `1` only when `status === "failed"` (`ok === false`); `partial` and `readiness` never move it. Usage errors are `2`.

Coverage is a first-class channel, not a fake warning. A sub-check that can't run yet — opt-in authoring rules or link-checking before `astro build` materializes `.nimbus/lint.json` / `.nimbus/routes.json`, or the type-check before `.astro/types.d.ts` exists — is reported as a **note** under `scopes[].notes[{ code, reason, requiresBuild?, requiresInput? }]`, counted in `summary.notes`. A note is never a `finding`, never carries a `fix`, and never affects the exit code; it resolves by making the missing thing exist (a build), not by `--fix`. A run that skipped types or authoring rules therefore never declares itself build-ready on an unverified scope. The headline is earned: *"Buildable"* on a scaffold whose correctness scopes are still notes, *"Ready"* only when every scope that ran evaluated clean with zero notes.

- `--json` emits `{ ok, status, readiness, summary{errors,warnings,notes,fixable,durationMs}, scopes[{scope,status,reason?,notes[]}], findings[{scope,code,severity,file,line,message,fixable,fix}] }`. An agent's fix loop terminates on `status !== "failed" && summary.fixable === 0` — a `partial` run with nothing left to fix is a stop (optionally build, then re-check), not a `--fix` retry.
- `--fix` applies safe fixes (installs, config rewrites via a static parse of `astro.config.ts`), prompting on a TTY for values it can't invent (e.g. the production `site` URL) and skipping them headless.
- `--env` / `--structure` / `--lint` / `--types` run a single category.
- `init` now ends with the env readiness pass — using the same scope-status vocabulary — so a fresh scaffold hears about a placeholder `site` at setup time.

`lint` is preserved as a first-class command with its own "zero `.mdx` → exit 1" guard; `check --lint` runs the same rules inside the preflight envelope. (Unlike `lint`, a config-only project with no `.mdx` is not an error for `check`.)

Config validation for `site` is now stricter: it must be an absolute `http(s)://` URL with a host. Previously a value missing the `//` (e.g. `https:example.com`) slipped through `new URL()` and shipped a broken canonical origin; it is now rejected both build-free by `check` and at build time by the config gate.
