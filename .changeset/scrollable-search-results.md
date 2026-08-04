---
"@cloudflare/create-nimbus-docs": patch
---

Fix search dialog results not scrolling. The results wrapper now lays out as a
flex column, so the results list gets a bounded height and its `overflow-y-auto`
engages — long result sets scroll within the dialog instead of being clipped,
while the search input stays in view above the scroll region.
