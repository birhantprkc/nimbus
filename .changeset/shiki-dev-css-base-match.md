---
"@cloudflare/nimbus-docs": patch
---

Fix syntax-highlighted code rendering uncoloured in dev on sites with a non-root `base` (e.g. `base: "/docs"`). The dev middleware that serves `_nimbus/shiki.css` compared the request path exactly against the based asset path, but Vite strips `base` from `req.url` at a non-root base, so the request 404'd and tokens fell back to their inherited colour. It now matches by suffix, serving the stylesheet regardless of how Vite presents `base`. Production was unaffected — the stylesheet is written statically at build time.
