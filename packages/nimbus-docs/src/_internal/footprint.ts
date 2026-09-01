// The recipe footprint — the source of truth for which server features are
// installed, re-derived from committed inputs (installed deps) so both the build
// (which emits the `.nimbus/features.json` cache) and `check` (build-free) agree
// without either trusting a stale artifact.
//
// A feature RECIPE declares its render mode + env keys; PRESENCE comes from the
// footprint. First-party loaders/features are npm packages, so presence is keyed
// off the dependency. Community loaders installed directly aren't declared here,
// so `check` can't see their env — a documented limitation, not a false pass.

export type RenderMode = "static" | "server";

export type EnvKind = "build-time" | "runtime";

export interface EnvRequirement {
  name: string;
  kind: EnvKind;
}

export interface FeatureRecipe {
  id: string;
  requires: RenderMode;
  env: EnvRequirement[];
  /** npm package whose presence in the footprint means the feature is installed. */
  dep: string;
  /**
   * On-demand route patterns this feature owns (e.g. `/mcp`). The prerender
   * invariant treats these as *explained* on-demand routes; every other
   * non-infra on-demand route is a violation. Empty/omitted for prerendered
   * features.
   */
  routes?: readonly string[];
}

// Populated by downstream feature slices (loaders, hosted MCP). Empty here: the
// foundation ships the seam, not the features.
export const FEATURE_RECIPES: readonly FeatureRecipe[] = [];

export function deriveFootprint(
  installedDeps: ReadonlySet<string>,
  recipes: readonly FeatureRecipe[] = FEATURE_RECIPES,
): FeatureRecipe[] {
  return recipes.filter((recipe) => installedDeps.has(recipe.dep));
}

/** The on-demand routes a footprint's installed features declare (deduped). */
export function footprintRoutes(footprint: readonly FeatureRecipe[]): string[] {
  return [...new Set(footprint.flatMap((f) => f.routes ?? []))];
}
