import type { NimbusConfig } from "./types.js";

/**
 * Define a typed Nimbus config. Returns the config unchanged but inferred.
 *
 * Lives in its own side-effect-free entry (`@cloudflare/nimbus-docs/config`) so
 * a `nimbus.config.ts` imported by BOTH `astro.config.ts` and the early
 * `content.config.ts` graph pulls only this identity function — never the
 * integration (mdx/sitemap/satteri/`node:child_process`). That keeps the
 * "a prose-only site pulls neither the engine nor its parser" contract intact
 * when a single config is the source of truth for the `api[]` spec list.
 */
export function defineConfig<T extends NimbusConfig>(config: T): T {
  return config;
}
