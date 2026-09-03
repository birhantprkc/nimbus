---
"@cloudflare/create-nimbus-docs": minor
---

Add a `--adapter <vercel|node|netlify|cloudflare>` scaffold flag for server output.

Passing `--adapter` selects `output: "server"` and wires the chosen adapter at scaffold time: it flips the generated `astro.config` at the `// nimbus:adapter` marker, appends the adapter's platform build dir to `.gitignore`, and for Cloudflare writes a server `wrangler.jsonc`. Node scaffolds include a production `start` script. `--deploy` is ignored with `--adapter` (server output owns its target). Config discovery follows Astro's own resolution order and supported set (`.mjs`/`.js`/`.ts`/`.mts`), matching the `nimbus-docs add adapter-*` opt-in. Copied templates are rejected if they contain symlinks so transformations cannot escape the project root.

Static scaffolds now preserve the `// nimbus:adapter` marker so the later `nimbus-docs add adapter-*` opt-in can reliably rewrite generated projects.

Reject destinations whose existing symlinked parent resolves outside the current directory, quote paths with spaces in next-step commands, and keep generated components compatible with adapter-defined `Astro.locals` types.
