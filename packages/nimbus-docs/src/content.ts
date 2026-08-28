/**
 * Content collection helpers for `nimbus-docs/content`.
 *
 * Users plug these into their `src/content.config.ts`:
 *
 *   import { defineCollection } from "astro:content";
 *   import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";
 *
 *   export const collections = {
 *     docs: defineCollection(docsCollection()),
 *     partials: defineCollection(partialsCollection()),
 *   };
 *
 * Extend the docs schema with extra frontmatter fields:
 *
 *   docs: defineCollection(docsCollection({
 *     schemaFields: { author: z.string(), tags: z.array(z.string()) },
 *   })),
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { glob } from "astro/loaders";
import type { Loader } from "astro/loaders";
import { z } from "astro/zod";

import {
  componentsSchema,
  defineDocSchema,
  definePartialsSchema,
  partialsSchema,
} from "./schemas.js";
import type { ApiRoutePolicy, ApiVersionSpec } from "./types.js";

// Re-export the public schema factories from `nimbus-docs/content` so users
// have a single import for content-config concerns (collections + schemas).
export {
  defineDocSchema,
  definePartialsSchema,
  defineSchema,
  docsSchema,
  partialsSchema,
  componentsSchema,
} from "./schemas.js";
export type { DefineSchemaOptions, DocSchemaConfig, ComponentProp } from "./schemas.js";

export interface DocsCollectionOptions<
  TFields extends Record<string, z.ZodTypeAny> = Record<string, never>,
> {
  /**
   * Directory under `src/content/` to load docs from.
   * Default: `"docs"`.
   */
  base?: string;
  /**
   * Glob pattern relative to `base`.
   * Default: `"** /*.{md,mdx}"` (space added to avoid breaking this comment).
   */
  pattern?: string;
  /**
   * Extra fields merged into the default docs schema. Lets users add
   * project-specific frontmatter (author, tags, etc.) without rebuilding
   * the whole schema.
   *
   * Generic-typed so the call-site shape (`{ author: z.string() }`) is
   * preserved through to the emitted entry data type — `entry.data.author`
   * resolves to `string`, not `unknown`.
   */
  schemaFields?: TFields;
  /**
   * When `false`, unknown frontmatter keys pass through instead of erroring
   * (default `true`). For ingesting byte-identical content with keys the
   * schema doesn't model. Declared fields in `schemaFields` stay typed.
   */
  strictFrontmatter?: boolean;
}

export interface PartialsCollectionOptions<
  TFields extends Record<string, z.ZodTypeAny> = Record<string, never>,
> {
  /**
   * Directory under `src/content/` to load partials from.
   * Default: `"partials"`.
   */
  base?: string;
  /**
   * Glob pattern relative to `base`.
   * Default: `"** /*.{md,mdx}"`.
   */
  pattern?: string;
  /**
   * Extra frontmatter fields merged into the default partials schema.
   * Useful for partials with product-specific metadata (e.g. CF's
   * `inputParameters`). Same generic-preserving shape as
   * `DocsCollectionOptions.schemaFields`.
   */
  schemaFields?: TFields;
}

const DEFAULT_PATTERN = "**/*.{md,mdx}";

/**
 * Returns an Astro content-collection config (`{ loader, schema }`) for the
 * docs collection. Pass to `defineCollection()`.
 */
export function docsCollection<
  TFields extends Record<string, z.ZodTypeAny> = Record<string, never>,
>(options: DocsCollectionOptions<TFields> = {}) {
  const base = `./src/content/${options.base ?? "docs"}`;
  const pattern = options.pattern ?? DEFAULT_PATTERN;
  const schema = defineDocSchema({
    fields: options.schemaFields,
    strictFrontmatter: options.strictFrontmatter,
  });

  return {
    loader: glob({ base, pattern }),
    schema,
  };
}

/**
 * Returns an Astro content-collection config (`{ loader, schema }`) for the
 * partials collection. Pass to `defineCollection()`.
 *
 * `schemaFields` extends the default partials schema with extra
 * frontmatter — same shape as `docsCollection({ schemaFields })`.
 */
export function partialsCollection<
  TFields extends Record<string, z.ZodTypeAny> = Record<string, never>,
>(options: PartialsCollectionOptions<TFields> = {}) {
  const base = `./src/content/${options.base ?? "partials"}`;
  const pattern = options.pattern ?? DEFAULT_PATTERN;
  // Avoid re-deriving the schema when no fields were declared — keeps the
  // default behaviour (`partialsSchema` with its `.default({})`) exact for
  // existing users who don't opt in.
  const schema = options.schemaFields
    ? definePartialsSchema({ fields: options.schemaFields })
    : partialsSchema;

  return {
    loader: glob({ base, pattern }),
    schema,
  };
}

export interface ComponentsCollectionOptions {
  /**
   * Directory under `src/content/` to load component entries from.
   * Default: `"components"`.
   */
  base?: string;
  /**
   * Glob pattern relative to `base`.
   * Default: `"**\/*.{md,mdx}"`.
   */
  pattern?: string;
}

/**
 * Returns an Astro content-collection config (`{ loader, schema }`) for the
 * components collection — for sites documenting their own UI components.
 *
 * Pairs with the `component-showcase` registry recipe, which installs the
 * matching `<Showcase>` / `<Example>` MDX wrappers and the `/components`
 * route. Frontmatter shape: `{ title, tagline, props }`.
 */
export function componentsCollection(options: ComponentsCollectionOptions = {}) {
  const base = `./src/content/${options.base ?? "components"}`;
  const pattern = options.pattern ?? DEFAULT_PATTERN;

  return {
    loader: glob({ base, pattern }),
    schema: componentsSchema,
  };
}

export interface ApiCollectionOptions {
  /** Collection name + base URL prefix — routes mount at `/<collection>`. */
  collection: string;
  /**
   * Local file path (relative to the project root) or an inline OpenAPI
   * object. Authored once in `nimbus.config.ts` `api[]`; pass the entry
   * straight through here. Omit when `versions` is set.
   */
  spec?: string | Record<string, unknown>;
  /** Human label for build diagnostics (falls back to `collection`). */
  label?: string;
  /**
   * A version family — one entry per version. The default version indexes at
   * `/<collection>`; others nest at `/<collection>/<version>`. Provide exactly
   * one of `spec` or `versions`.
   */
  versions?: ApiVersionSpec[];
  /** Fail the build on an operation missing a usable `operationId`. Default false. */
  requireOperationId?: boolean;
  /** Route convention for this collection's pages (unversioned only; for a family
   *  set `routes` on each version). Omit to keep legacy operationId URLs. */
  routes?: ApiRoutePolicy;
}

/**
 * Content-collection config for one OpenAPI reference spec. The loader is a
 * thin **index**: it parses the spec once at build time and writes one small
 * DataStore entry per page (`{ id: slug, data: { coordinate, title,
 * description? } }`). Only routing + display metadata is stored — the heavy
 * parsed model is NOT, so render re-derives it from the same spec via
 * `getApiModel()` and nothing depends on a cache surviving the content-sync →
 * render phase boundary.
 *
 *   // src/content.config.ts
 *   import nimbus from "./nimbus.config";
 *   export const collections = {
 *     docs: defineCollection(docsCollection()),
 *     ...Object.fromEntries(
 *       (nimbus.api ?? []).map((a) => [a.collection, defineCollection(apiCollection(a))]),
 *     ),
 *   };
 *
 * For that single source of truth to stay off the integration's module graph
 * (which this early content-config pass must not pull in), have `nimbus.config`
 * build its config with `defineConfig` from the side-effect-free
 * `@cloudflare/nimbus-docs/config` entry — not the main `@cloudflare/nimbus-docs`.
 *
 * The OpenAPI engine is imported lazily inside `load()` — a prose-only site
 * that never registers an API collection pulls neither the engine nor its
 * parser.
 */
export function apiCollection(options: ApiCollectionOptions): {
  loader: Loader;
  schema: z.ZodType<{
    coordinate: string;
    title: string;
    description?: string;
    version?: string;
  }>;
} {
  const { collection, spec, label, versions, requireOperationId, routes } = options;

  const loader: Loader = {
    name: "nimbus-docs:api",
    async load(context) {
      const { logger, store, parseData, config: astroConfig, watcher } = context;

      assertSupportedNode();

      const [
        { buildApiModel, getApiPageIndex, getApiRouteProvenance, clearApiModelCache },
        { resolveSpecSource },
        { resolveApiFamily, apiPageRoute },
      ] = await Promise.all([
        import("./api/index.js"),
        import("./_internal/api/resolve-spec.js"),
        import("./_internal/api/resolve-versions.js"),
      ]);

      const rootDir = fileURLToPath(astroConfig.root);
      const targets = resolveApiFamily({ collection, spec, label, versions, requireOperationId, routes });

      // M4: a non-default version id must not collide with a top-level page
      // slug of the default version (both would claim `/<collection>/<id>`).
      // Config validation rejects the structural reserved ids (schemas/tags/…);
      // this catches the dynamic set — an untagged `operationId` or a tag that
      // happens to equal a version id — which is only knowable post-parse.
      const nonDefaultVersionIds = targets
        .filter((t) => !t.isDefault && t.version)
        .map((t) => t.version!);

      const index = async () => {
        store.clear();
        // Default-version top segment → the route provenances that produced it
        // ("override"/"derived"/"fallback", or "identity" for a page with none),
        // so the shadow diagnostic names the lever that actually moves each. Per
        // run, so a dev-watch reparse never inherits a stale segment.
        const defaultTopSegments = new Map<string, Set<string>>();
        // Two pages minting the same id is a silent last-writer-wins clobber
        // (e.g. an untagged `operationId: "index"` vs the default root's id).
        const seenIds = new Map<string, string>();
        // Cross-version drift: coordinate → (version → derived slug). Only
        // `derived` slugs are compared (overrides and fallbacks are excluded);
        // hidden versions are included, since they emit real URLs and links.
        const derivedByCoordinate = new Map<string, Map<string, string>>();
        for (const target of targets) {
          let model;
          try {
            const source = await resolveSpecSource(
              {
                collection: target.namespace,
                spec: target.spec,
                label: target.label,
                mountPath: target.mountPath,
                requireOperationId: target.requireOperationId,
                routes: target.routes,
              },
              rootDir,
            );
            model = await buildApiModel(source);
          } catch (err) {
            // `ApiBuildError` already formats a pointed diagnostic list; surface
            // it (plus which spec failed) and fail the build cleanly.
            logger.error(
              `Failed to build the API reference for "${target.label}":\n${(err as Error).message}`,
            );
            throw err;
          }

          const provenance = getApiRouteProvenance(model);
          for (const { coordinate, slug, title, description } of getApiPageIndex(
            model,
          )) {
            if (target.isDefault && slug !== "") {
              const top = slug.split("/")[0]!;
              const kinds = defaultTopSegments.get(top) ?? new Set<string>();
              kinds.add(provenance.get(coordinate) ?? "identity");
              defaultTopSegments.set(top, kinds);
            }
            if (target.version && provenance.get(coordinate) === "derived") {
              const byVersion =
                derivedByCoordinate.get(coordinate) ??
                derivedByCoordinate.set(coordinate, new Map()).get(coordinate)!;
              byVersion.set(target.version, slug);
            }
            const { storeId: id } = apiPageRoute(target, slug);
            const prior = seenIds.get(id);
            if (prior !== undefined) {
              const message =
                `nimbus-docs api: collection "${collection}"${target.version ? ` version "${target.version}"` : ""} ` +
                `maps two pages ("${prior}" and "${coordinate}") to the same route id "${id}". ` +
                `Rename one operation/tag so their URLs stay distinct.`;
              logger.error(message);
              throw new Error(message);
            }
            seenIds.set(id, coordinate);
            const data = await parseData({
              id,
              data: {
                coordinate,
                title,
                ...(description === undefined ? {} : { description }),
                ...(target.version ? { version: target.version } : {}),
              },
            });
            store.set({ id, data });
          }
        }
        for (const versionId of nonDefaultVersionIds) {
          const kinds = defaultTopSegments.get(versionId);
          if (kinds) {
            // Renaming the version always resolves it; the second lever names the
            // hardest provenance present, since renaming an operationId moves
            // neither an override slug (pinned) nor a derived one (method+path).
            const fix = kinds.has("override")
              ? `Rename the version, or adjust the \`routes.operations\` override target for the colliding page, `
              : kinds.has("derived")
                ? `Rename the version, or pin a \`routes.operations\` override for the colliding operation ` +
                  `(a resource-action-v1 slug is derived from method and path, so renaming the operationId will not change it), `
                : `Rename the version, or the colliding operation/tag, `;
            const message =
              `nimbus-docs api: version "${versionId}" of collection "${collection}" collides with a ` +
              `default-version page mounted at /${collection}/${versionId}. ${fix}so the version segment stays unambiguous.`;
            logger.error(message);
            throw new Error(message);
          }
        }
        // Cross-version drift (non-gating): one coordinate whose resource-action-v1-derived
        // slug differs across two or more versions. Divergent wire paths across
        // versions are legitimate, so this warns and recommends pinning an
        // override; it never fails the build.
        for (const [coordinate, byVersion] of derivedByCoordinate) {
          if (byVersion.size < 2) continue;
          const distinct = new Set(byVersion.values());
          if (distinct.size < 2) continue;
          const detail = [...byVersion]
            .map(([version, slug]) => `${version}→"${slug}"`)
            .join(", ");
          logger.warn(
            `nimbus-docs api: coordinate "${coordinate}" derives different resource-action-v1 slugs across ` +
              `versions of "${collection}" (${detail}). Pin an explicit \`routes.operations\` ` +
              `override in each version to keep the URL stable across versions.`,
          );
        }
        logger.info(
          `Indexed ${store.keys().length} API pages for "${collection}".`,
        );
      };

      await index();

      // Dev only: reparse when any on-disk version spec changes. Inline-object
      // specs have no file to watch.
      if (watcher) {
        const specPaths = new Map<string, true>();
        for (const target of targets) {
          if (typeof target.spec !== "string") continue;
          specPaths.set(path.resolve(rootDir, target.spec), true);
        }
        if (specPaths.size > 0) {
          const onChange = async (changed: string) => {
            if (!specPaths.has(path.resolve(changed))) return;
            clearApiModelCache(collection);
            await index();
          };
          for (const specPath of specPaths.keys()) watcher.add(specPath);
          watcher.on("change", onChange);
          watcher.on("add", onChange);
        }
      }
    },
  };

  return {
    loader,
    schema: z.object({
      coordinate: z.string(),
      title: z.string(),
      description: z.string().optional(),
      version: z.string().optional(),
    }),
  };
}

function assertSupportedNode(): void {
  const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error(
      `nimbus-docs api: Node >=22.12.0 is required to build an API reference ` +
        `(running ${process.versions.node}). Upgrade Node, or remove the \`api\` block from nimbus.config.`,
    );
  }
}
