---
"@cloudflare/nimbus-docs": minor
"@cloudflare/create-nimbus-docs": patch
---

Replace `astro-icon` with a built-in icon system. Nimbus now provides `virtual:nimbus/icons` (a Vite plugin) and `@cloudflare/nimbus-docs/components/Icon.astro` as a drop-in replacement.

The key fix: the virtual module does not emit `lastModified` metadata, so Astro's incremental build cache treats the icon module as stable across builds. `astro-icon` stamped a generated timestamp into every build, invalidating thousands of cached pages.

The plugin is enabled by default from `nimbus()`. Set `icons: false` in the Nimbus integration options to disable. Auto-detects `@iconify-json/*` packages from the consumer's `package.json` and loads local SVGs from `src/icons/`.

Consumers should replace `import { Icon } from "astro-icon/components"` with `import Icon from "@cloudflare/nimbus-docs/components/Icon.astro"`. The API is compatible: `name`, `size`, `width`, `height`, `is:inline`, `title`, `desc`, and all other `<svg>` attributes.

Starter templates updated: removed `astro-icon` dependency and `icon()` integration from `astro.config.ts`; all component imports updated to the new path.
