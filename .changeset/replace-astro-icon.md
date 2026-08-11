---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": patch
---

Replace `astro-icon` with a built-in icon system. This is a breaking change for any project using `astro-icon` directly.

**Why:** `astro-icon` stamped a generated `lastModified` timestamp into its virtual module on every build, invalidating thousands of cached pages in Astro's incremental build cache. The package is unmaintained so an upstream fix isn't coming.

**What's new:** Nimbus now provides `virtual:nimbus/icons` (a Vite plugin) and `@cloudflare/nimbus-docs/components/Icon.astro`. The plugin auto-detects installed `@iconify-json/*` packages and loads local SVGs from `src/icons/`. The component API is compatible with `astro-icon` (`name`, `size`, `width`, `height`, `is:inline`, `title`, `desc`, and all `<svg>` attributes).

**Breaking changes:**

- Remove `astro-icon` from your `package.json` and `astro.config.ts`
- Replace `import { Icon } from "astro-icon/components"` with `import Icon from "@cloudflare/nimbus-docs/components/Icon.astro"`
- SVG output structure changed: SVGs are always inlined; the previous `<symbol>`/`<use>` pattern produced duplicate DOM IDs when the same icon was used more than once on a page, so it has been removed. Any CSS or JS targeting `symbol` or `use` elements will need updating.

**Migration:**

```diff
- import { Icon } from "astro-icon/components";
+ import Icon from "@cloudflare/nimbus-docs/components/Icon.astro";
```

Starter templates updated: removed `astro-icon` dependency and `icon()` integration from `astro.config.ts`; all component imports updated to the new path.
