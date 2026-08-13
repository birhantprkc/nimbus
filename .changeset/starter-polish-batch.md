---
"@cloudflare/create-nimbus-docs": patch
---

Starter accessibility, layout-stability, and no-flash navigation fixes:

- Skip link now lands focus — `<main>` gets `id="main-content"` and `tabindex="-1"` on the 404, home, and docs layouts.
- Closed sidebar groups leave the tab order (`inert`), including the pre-hydration restore path.
- "On this page" no longer reflows when an item becomes active (width-reserving ghost).
- Focus rings no longer flash on first focus (base-layer outline default so the ring color/width/offset never animate).
- Client-side navigation via `<ClientRouter />` with a blocking (`is:inline`) theme bootstrap to remove the first-paint theme flash, a page-content view transition, and a navigation-safe sidebar-state restore that keeps the active item visible.
