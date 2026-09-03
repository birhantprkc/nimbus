/**
 * @internal
 *
 * Public-but-unstable subpath (`@cloudflare/nimbus-docs/adapters`). It exists so
 * `@cloudflare/create-nimbus-docs` can run the *exact* server-output opt-in the
 * `nimbus-docs add adapter-*` CLI runs — the config edit + adapter recipe + the
 * Cloudflare server-wrangler emitter — without forking the transform. Fresh
 * Cloudflare scaffolds additionally switch the template-owned rendering
 * default; customized existing configs receive an agent handoff.
 *
 * Curated re-export, never `export *`: the internal-only helpers (config
 * classifiers, idempotency detectors, id list) stay private. No external
 * stability guarantee — this surface tracks the scaffolder, not semver.
 */
export {
  ADAPTER_MARKER,
  ADAPTER_RECIPES,
  ASTRO_CONFIG_FILENAMES,
  applyAdapterToConfig,
  buildServerWranglerConfig,
  sanitizeWorkerName,
} from "./_internal/adapters.js";
export type {
  AdapterId,
  AdapterRecipe,
  ApplyAdapterResult,
  ServerWranglerRecipe,
  WranglerInputs,
} from "./_internal/adapters.js";
