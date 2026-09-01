/**
 * The audience seam for on-request rendering. `ProjectionContext` carries the
 * requester identity resolved from Astro `locals`; v1 only knows the default
 * `public` audience. Emission loaders (`getIndexedEntries`, `getVisibleEntries`)
 * partition their caches by `audienceCacheKey` so a future per-identity view
 * can't poison another audience's cache. There is no content-visibility gate in
 * v1 — every published entry is public.
 */

// `key` is the cache-partition key; `groups` is the seam for permitted groups.
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
