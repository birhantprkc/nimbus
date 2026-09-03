import path from "node:path";

import type { RenderingConfig, RenderingMode } from "../types.js";
import {
  collectionMountPrefix,
  type VersionInfo,
} from "./collection-mount.js";

export interface CompiledRenderingPolicy {
  default: RenderingMode;
  collections: Readonly<Record<string, RenderingMode>>;
}

export function compileRenderingPolicy(
  rendering: RenderingConfig | undefined,
  canonicalCollections: readonly string[],
): CompiledRenderingPolicy {
  const known = new Set(canonicalCollections);
  const overrides = rendering?.collections ?? {};
  const unknown = Object.keys(overrides).filter(
    (collection) => !known.has(collection),
  );
  if (unknown.length > 0) {
    throw new Error(
      `nimbus-docs: rendering.collections references collection${unknown.length === 1 ? "" : "s"} without a registered canonical catch-all route:\n` +
        unknown.map((collection) => `  - "${collection}"`).join("\n") +
        "\n\nRegister each collection and add its canonical catch-all route before configuring its rendering mode.",
    );
  }

  const defaultMode = rendering?.default ?? "build";
  return {
    default: defaultMode,
    collections: Object.fromEntries(
      canonicalCollections.map((collection) => [
        collection,
        overrides[collection] ?? defaultMode,
      ]),
    ),
  };
}

export function canonicalCollectionRouteComponent(
  srcDir: string,
  collection: string,
  versions?: VersionInfo | null,
): string {
  const mount = collectionMountPrefix(collection, versions).slice(1);
  return path.join(srcDir, "pages", mount, "[...slug].astro");
}

export function routeComponentKeys(
  projectRoot: string,
  component: string,
): string[] {
  const absolute = normalizeRouteComponent(component);
  const relative = normalizeRouteComponent(path.relative(projectRoot, component));
  return [absolute, relative];
}

export function normalizeRouteComponent(component: string): string {
  return component
    .replace(/[?#].*$/, "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "");
}
