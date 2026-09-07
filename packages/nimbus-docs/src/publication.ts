import { entryRouteKey } from "./_internal/astro-slug.js";
import type {
  PreparedLlmsManifestArtifact,
  PreparedMarkdownManifestArtifact,
} from "./_internal/prepared-artifacts.js";
import { withBase } from "./_internal/url.js";
import type {
  PreparedLlmsArtifact,
  PreparedLlmsReference,
  PreparedMarkdownArtifact,
  PreparedMarkdownReference,
  PreparedMarkdownSurface,
} from "./types.js";

let preparedArtifactsModule: Promise<
  typeof import("virtual:nimbus/prepared-artifacts")
> | null = null;
let preparedAssetLoaderModule: Promise<
  typeof import("virtual:nimbus/prepared-asset-loader")
> | null = null;
let markdownByIdentity:
  | Map<string, PreparedMarkdownManifestArtifact>
  | undefined;
let markdownByRoute: Map<string, PreparedMarkdownManifestArtifact> | undefined;
let llmsByIdentity: Map<string, PreparedLlmsManifestArtifact> | undefined;

interface PublicationContext {
  request?: Request;
}

function loadPreparedArtifacts() {
  preparedArtifactsModule ??= import("virtual:nimbus/prepared-artifacts");
  return preparedArtifactsModule;
}

function loadPreparedAssetLoader() {
  preparedAssetLoaderModule ??= import(
    "virtual:nimbus/prepared-asset-loader"
  );
  return preparedAssetLoaderModule;
}

function markdownIdentity(reference: PreparedMarkdownReference): string {
  return `${reference.collection}\0${reference.id}\0${reference.surface}`;
}

function markdownRouteIdentity(options: {
  collection: string;
  surface: PreparedMarkdownSurface;
  slug?: string;
}): string {
  return `${options.collection}\0${options.surface}\0${options.slug ?? ""}`;
}

function llmsIdentity(reference: PreparedLlmsReference): string {
  return reference.scope === "site"
    ? `${reference.scope}\0${reference.surface}`
    : `${reference.scope}\0${reference.section}\0${reference.surface}`;
}

async function readArtifactBody(
  artifactPath: string,
  context: PublicationContext,
): Promise<string> {
  const prepared = await loadPreparedArtifacts();
  const publicPath = withBase(
    `/_nimbus/prepared-artifacts/${artifactPath}`,
    prepared.base,
  );
  if (context.request) {
    const { fetchPreparedAsset } = await loadPreparedAssetLoader();
    const response = await fetchPreparedAsset(publicPath, context.request);
    if (response) {
      if (!response.ok) {
        throw new Error(
          `nimbus-docs: prepared publication asset ${JSON.stringify(publicPath)} returned ${response.status}.`,
        );
      }
      return response.text();
    }
  }
  try {
    const [{ readFile }, path] = await Promise.all([
      import("node:fs/promises"),
      import("node:path"),
    ]);
    return await readFile(
      path.join(
        prepared.projectRoot,
        ".astro",
        "nimbus",
        "prepared-artifacts",
        artifactPath,
      ),
      "utf8",
    );
  } catch (error) {
    if (!context.request) throw error;
  }
  const response = await fetch(new URL(publicPath, context.request.url));
  if (!response.ok) {
    throw new Error(
      `nimbus-docs: prepared publication asset ${JSON.stringify(publicPath)} returned ${response.status}.`,
    );
  }
  return response.text();
}

async function markdownIndexes() {
  const { markdownArtifacts } = await loadPreparedArtifacts();
  if (!markdownByIdentity || !markdownByRoute) {
    markdownByIdentity = new Map();
    markdownByRoute = new Map();
    for (const artifact of markdownArtifacts) {
      markdownByIdentity.set(markdownIdentity(artifact), artifact);
      markdownByRoute.set(
        markdownRouteIdentity({
          collection: artifact.collection,
          surface: artifact.surface,
          slug: entryRouteKey(artifact.id),
        }),
        artifact,
      );
    }
  }
  return { markdownArtifacts, markdownByIdentity, markdownByRoute };
}

async function llmsIndex() {
  const { llmsArtifacts } = await loadPreparedArtifacts();
  if (!llmsByIdentity) {
    llmsByIdentity = new Map(
      llmsArtifacts.map((artifact) => [llmsIdentity(artifact), artifact]),
    );
  }
  return { llmsArtifacts, llmsByIdentity };
}

export async function getPreparedMarkdownRouteStaticPaths(options: {
  collection: string;
  surface: PreparedMarkdownSurface;
}) {
  const { markdownArtifacts } = await markdownIndexes();
  return markdownArtifacts
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
        } satisfies PreparedMarkdownReference,
      },
      cacheKey: artifact.digest,
    }));
}

export async function getPreparedMarkdownRouteArtifact(options: {
  collection: string;
  surface: PreparedMarkdownSurface;
  slug?: string;
  reference?: PreparedMarkdownReference;
  context?: PublicationContext;
}): Promise<PreparedMarkdownArtifact | null> {
  const indexes = await markdownIndexes();
  const artifact = options.reference
    ? indexes.markdownByIdentity.get(markdownIdentity(options.reference))
    : indexes.markdownByRoute.get(markdownRouteIdentity(options));
  if (!artifact) return null;
  const body = await readArtifactBody(artifact.path, options.context ?? {});
  return {
    collection: artifact.collection,
    id: artifact.id,
    surface: artifact.surface,
    digest: artifact.digest,
    mediaType: artifact.mediaType,
    body,
    content: body.slice(artifact.contentStart, artifact.contentEnd),
  };
}

export async function getPreparedLlmsRouteArtifact(
  reference: PreparedLlmsReference,
  context: PublicationContext = {},
): Promise<PreparedLlmsArtifact | null> {
  const { llmsByIdentity } = await llmsIndex();
  const artifact = llmsByIdentity.get(llmsIdentity(reference));
  if (!artifact) return null;
  return {
    ...reference,
    digest: artifact.digest,
    mediaType: artifact.mediaType,
    body: await readArtifactBody(artifact.path, context),
  };
}

export async function getPreparedLlmsRouteStaticPaths() {
  const { llmsArtifacts } = await llmsIndex();
  return llmsArtifacts
    .filter(
      (
        artifact,
      ): artifact is Extract<
        PreparedLlmsManifestArtifact,
        { scope: "section" }
      > => artifact.scope === "section" && artifact.surface === "index",
    )
    .map((artifact) => ({
      params: { section: artifact.section },
      props: {
        artifact: {
          scope: artifact.scope,
          surface: artifact.surface,
          section: artifact.section,
        } satisfies PreparedLlmsReference,
      },
      cacheKey: artifact.digest,
    }));
}
