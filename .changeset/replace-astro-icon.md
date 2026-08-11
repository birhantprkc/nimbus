---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": patch
---

Replace `astro-icon` with a built-in icon system. This is a breaking change for any project using `astro-icon` directly.

**Why:** `astro-icon` stamped a generated `lastModified` timestamp into its virtual module on every build, invalidating thousands of cached pages in Astro's incremental build cache. The package is unmaintained so an upstream fix isn't coming.

**What's new:** Nimbus now provides `virtual:nimbus/icons` (a Vite plugin) and `@cloudflare/nimbus-docs/components/Icon.astro`. The plugin auto-detects installed `@iconify-json/*` packages and loads local SVGs from `src/icons/`. Icons are always inlined as SVG — no `<symbol>`/`<use>` pattern.

**Breaking changes:**

- Remove `astro-icon` from your `package.json` and `astro.config.ts`
- Replace `import { Icon } from "astro-icon/components"` with `import Icon from "@cloudflare/nimbus-docs/components/Icon.astro"`
- The `is:inline` prop is removed — SVGs are always inlined
- The `config` named export from `virtual:nimbus/icons` is removed
- SVG output structure changed: no longer emits `<symbol>`/`<use>` pairs, so any CSS or JS targeting those elements will need updating

**Migration:**

```diff
- import { Icon } from "astro-icon/components";
+ import Icon from "@cloudflare/nimbus-docs/components/Icon.astro";

- <Icon name="ph:rocket" is:inline class="w-6 h-6" />
+ <Icon name="ph:rocket" class="w-6 h-6" />
```

Starter templates updated: removed `astro-icon` dependency and `icon()` integration from `astro.config.ts`; all component imports updated to the new path.
