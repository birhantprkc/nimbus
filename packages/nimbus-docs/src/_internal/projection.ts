/**
 * The public projection — the single predicate deciding which content entries
 * are public and therefore emitted into `dist`. Both emission loaders
 * (`getIndexedEntries`, `getVisibleEntries`) run entries through it, so HTML,
 * twins, llms.txt, the sidebar, Pagefind, and the sitemap can't disagree
 * (ticket seams #1–#3). Classification is by the entry's store `id` against the
 * config `gated` globs — never a filesystem path — so loader-sourced entries
 * with no on-disk file gate identically (AC#5). The gate applies in dev too
 * (it's a visibility boundary, not a draft toggle). The optional
 * `ProjectionContext` is the audience seam; v1 only knows the default `public`.
 */

import picomatch from "picomatch";

import type { NimbusConfig } from "../types.js";
import { loadNimbusConfig } from "./runtime-config.js";

// `key` is the cache-partition key; `groups` is the seam for permitted gated groups (BG-1b+).
export interface Audience {
  readonly key: string;
  readonly groups?: readonly string[];
}

export const PUBLIC_AUDIENCE: Audience = Object.freeze({ key: "public" });

export interface ProjectionContext {
  audience?: Audience;
}

export function resolveAudience(ctx?: ProjectionContext): Audience {
  return ctx?.audience ?? PUBLIC_AUDIENCE;
}

export function audienceCacheKey(audience: Audience): string {
  const groups = audience.groups ? [...audience.groups].sort() : [];
  return JSON.stringify([audience.key, groups]);
}

// picomatch matcher, memoised by the exact glob set.
let cachedGlobsKey: string | null = null;
let cachedIsGated: ((id: string) => boolean) | null = null;

function normalizeId(id: string): string {
  return id.replace(/^\.?\//, "");
}

function gatedMatcher(globs: readonly string[]): (id: string) => boolean {
  const key = JSON.stringify(globs);
  if (cachedIsGated && cachedGlobsKey === key) return cachedIsGated;
  if (globs.length === 0) {
    cachedIsGated = () => false;
  } else {
    const isMatch = picomatch(globs as string[], { dot: true });
    cachedIsGated = (id: string) => isMatch(normalizeId(id));
  }
  cachedGlobsKey = key;
  return cachedIsGated;
}

export function clearProjectionCache(): void {
  cachedGlobsKey = null;
  cachedIsGated = null;
}

// v1: gated ⇔ matches a glob, for every audience. Later audiences subtract their permitted groups here.
export function isGatedFor(
  id: string,
  gatedGlobs: readonly string[],
  _audience: Audience,
): boolean {
  return gatedMatcher(gatedGlobs)(id);
}

export async function projectEntries<T>(
  entries: readonly T[],
  getId: (entry: T) => string,
  ctx?: ProjectionContext,
): Promise<T[]> {
  const config = await loadNimbusConfig();
  return projectEntriesWith(entries, getId, config, ctx);
}

export function projectEntriesWith<T>(
  entries: readonly T[],
  getId: (entry: T) => string,
  config: NimbusConfig,
  ctx?: ProjectionContext,
): T[] {
  const globs = config.gated ?? [];
  if (globs.length === 0) return entries.slice();
  const audience = resolveAudience(ctx);
  return entries.filter((entry) => !isGatedFor(getId(entry), globs, audience));
}
