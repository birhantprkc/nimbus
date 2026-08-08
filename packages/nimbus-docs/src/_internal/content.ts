/**
 * Content collection access for helpers.
 *
 * Dynamic import of `astro:content` for the same reason as
 * runtime-config: Astro's config loader runs in plain Node, where
 * `astro:content` doesn't exist. We defer to call time, which only
 * happens at page render.
 *
 * There is intentionally no global "list of collections Nimbus knows
 * about" — the framework doesn't try to mirror what
 * `content.config.ts` registers. Callers that need entries from
 * multiple collections pass them explicitly; the sidebar builder
 * derives its list from `sidebar.items` references.
 */

import type { CollectionEntry } from "astro:content";

import {
  audienceCacheKey,
  projectEntries,
  resolveAudience,
  type ProjectionContext,
} from "./projection.js";

/** Primary collection name. Hard-coded — see also `getDocsStaticPaths`. */
const PRIMARY_COLLECTION = "docs";

/**
 * Return visible entries from one or more collections. Drafts are
 * filtered out in production builds (matching the existing
 * single-collection behaviour).
 *
 * Defaults to `["docs"]` — the framework's primary collection.
 * Cross-collection callers (llms.txt aggregators, custom indexes,
 * etc.) pass an explicit list.
 *
 * Returns a flat `CollectionEntry<string>[]` so cross-collection
 * traversal doesn't need to know the user's collection names at type
 * time. Callers that need per-collection type safety should call
 * `getCollection("api")` directly.
 */
export async function getVisibleEntries(
  collections: string[] = [PRIMARY_COLLECTION],
  ctx?: ProjectionContext,
): Promise<CollectionEntry<string>[]> {
  const lists = await Promise.all(collections.map((n) => loadVisibleEntries(n, ctx)));
  return lists.flat();
}

export async function getVisibleEntry(
  collection: string,
  id: string,
  ctx?: ProjectionContext,
): Promise<CollectionEntry<string> | null> {
  const entries = await loadVisibleEntries(collection, ctx);
  return entries.find((entry) => entry.id === id) ?? null;
}

/**
 * Return visible entries grouped by collection. Used by the sidebar
 * builder so `collection:` autogenerate can look up entries by name
 * without re-fetching.
 */
// Per-collection cache, reused across pages (dev too); cleared on content
// change. Draft filtering stays PROD-only. Keyed `<collection>::<audienceKey>`
// so a per-audience projection can't poison another audience's cache.
const visibleEntriesByName = new Map<string, CollectionEntry<string>[]>();

/** Drop the visible-entry cache (dev content-change invalidation). */
export function clearContentCaches(): void {
  visibleEntriesByName.clear();
}

async function loadVisibleEntries(
  name: string,
  ctx?: ProjectionContext,
): Promise<CollectionEntry<string>[]> {
  const cacheKey = `${name}::${audienceCacheKey(resolveAudience(ctx))}`;
  const cached = visibleEntriesByName.get(cacheKey);
  if (cached) return cached;
  const { getCollection } = await import("astro:content");
  const all = await getCollection(name).catch(
    () => [] as CollectionEntry<string>[],
  );
  const published = import.meta.env.PROD
    ? all.filter((entry: CollectionEntry<string>) => !entry.data.draft)
    : all;
  // Public projection: gated entries excluded from emission (dev + prod).
  const visible = await projectEntries(published, (entry) => entry.id, ctx);
  visibleEntriesByName.set(cacheKey, visible);
  return visible;
}

export async function getVisibleEntriesByCollection(
  collections: string[],
  ctx?: ProjectionContext,
): Promise<Record<string, CollectionEntry<string>[]>> {
  const out: Record<string, CollectionEntry<string>[]> = {};
  await Promise.all(
    collections.map(async (name) => {
      out[name] = await loadVisibleEntries(name, ctx);
    }),
  );
  return out;
}
