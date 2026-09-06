import {
  getPreparedArtifactManifest,
  registerPreparedArtifactDemand,
  readPreparedLlmsArtifact,
  readPreparedMarkdownArtifact,
} from "./_internal/prepared-artifacts.js";
import type {
  PreparedLlmsArtifact,
  PreparedLlmsReference,
  PreparedMarkdownArtifact,
  PreparedMarkdownReference,
  PreparedMarkdownSurface,
} from "./types.js";
import { entryRouteKey } from "./_internal/astro-slug.js";

export type {
  PreparedLlmsArtifact,
  PreparedLlmsReference,
  PreparedMarkdownArtifact,
  PreparedMarkdownReference,
  PreparedMarkdownSurface,
} from "./types.js";

const projectRoot: unknown =
  typeof import.meta.env === "object"
    ? import.meta.env.NIMBUS_PROJECT_ROOT
    : undefined;

if (typeof projectRoot === "string" && projectRoot.length > 0) {
  registerPreparedArtifactDemand(projectRoot);
}

function configuredRoot(): string {
  if (typeof projectRoot !== "string" || projectRoot.length === 0) {
    throw new Error(
      "nimbus-docs: build helpers require the Nimbus Astro integration.",
    );
  }
  return projectRoot;
}

export async function getPreparedMarkdownStaticPaths(options: {
  collection: string;
  surface: PreparedMarkdownSurface;
}): Promise<
  Array<{
    params: { slug: string | undefined };
    props: { artifact: PreparedMarkdownReference };
    cacheKey: string;
  }>
> {
  const manifest = await getPreparedArtifactManifest(configuredRoot());
  return manifest.markdownArtifacts
    .filter(
      (artifact) =>
        artifact.collection === options.collection &&
        artifact.surface === options.surface,
    )
    .map((artifact) => ({
      params: { slug: entryRouteKey(artifact.id) || undefined },
      props: {
        artifact: {
          collection: artifact.collection,
          id: artifact.id,
          surface: artifact.surface,
        },
      },
      cacheKey: artifact.digest,
    }));
}

export function getPreparedMarkdownArtifact(
  reference: PreparedMarkdownReference,
): Promise<PreparedMarkdownArtifact> {
  return readPreparedMarkdownArtifact(configuredRoot(), reference);
}

export async function getPreparedLlmsStaticPaths(): Promise<
  Array<{
    params: { section: string };
    props: { artifact: PreparedLlmsReference };
    cacheKey: string;
  }>
> {
  const manifest = await getPreparedArtifactManifest(configuredRoot());
  return manifest.llmsArtifacts
    .filter(
      (
        artifact,
      ): artifact is Extract<
        (typeof manifest.llmsArtifacts)[number],
        { scope: "section" }
      > => artifact.scope === "section",
    )
    .map((artifact) => ({
      params: { section: artifact.section },
      props: {
        artifact: {
          scope: "section",
          surface: "index",
          section: artifact.section,
        },
      },
      cacheKey: artifact.digest,
    }));
}

export function getPreparedLlmsArtifact(
  reference: PreparedLlmsReference,
): Promise<PreparedLlmsArtifact> {
  return readPreparedLlmsArtifact(configuredRoot(), reference);
}
