---
"@cloudflare/nimbus-docs": minor
---

`makeDisclosure` now marks closed content `inert` so collapsed regions leave the tab order, keeping keyboard focus out of hidden disclosure panels. Add a `manageInert` option (default `true`) to opt out for consumers that manage their own focus.
