---
"@cloudflare/create-nimbus-docs": patch
---

Guard the `PackageManagers` restore script's `textContent` access with optional chaining so the starter passes a strict `astro check` (part of the CJK/type-safety fixes).
