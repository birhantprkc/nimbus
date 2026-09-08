import { entryRouteKey } from "./_internal/astro-slug.js";
import type {
  LlmsEndpointAsset,
  MarkdownEndpointAsset,
} from "./_internal/agent-endpoint-assets.js";
import { withBase } from "./_internal/url.js";
export type MarkdownEndpointSurface = "markdown" | "source";

export interface MarkdownEndpointReference {
  collection: string;
  id: string;
  surface: MarkdownEndpointSurface;
}

export interface MarkdownEndpointPayload extends MarkdownEndpointReference {
  digest: string;
  mediaType: string;
  body: string;
  content: string;
}

export type LlmsEndpointReference =
  | { scope: "site"; surface: "index" | "full" }
  | { scope: "section"; surface: "index"; section: string };

export type LlmsEndpointPayload = LlmsEndpointReference & {
  digest: string;
  mediaType: string;
  body: string;
};

let agentEndpointAssetsModule: Promise<
  typeof import("virtual:nimbus/agent-endpoint-assets")
> | null = null;
let agentEndpointAssetLoaderModule: Promise<
  typeof import("virtual:nimbus/agent-endpoint-asset-loader")
> | null = null;
let markdownByIdentity:
  | Map<string, MarkdownEndpointAsset>
  | undefined;
let markdownByRoute: Map<string, MarkdownEndpointAsset> | undefined;
let llmsByIdentity: Map<string, LlmsEndpointAsset> | undefined;

interface AgentEndpointContext {
  request?: Request;
}

function agentEndpointAssetResponseError(url: URL, status: number): Error {
  if (status === 404) {
    return new Error(
      `nimbus-docs: agent-endpoint asset not found at ${url.href}; verify client assets were deployed.`,
    );
  }
  return new Error(
    `nimbus-docs: agent-endpoint asset at ${url.href} returned ${status}.`,
  );
}

function loadAgentEndpointAssets() {
  agentEndpointAssetsModule ??= import("virtual:nimbus/agent-endpoint-assets");
  return agentEndpointAssetsModule;
}

function loadAgentEndpointAssetLoader() {
  agentEndpointAssetLoaderModule ??= import(
    "virtual:nimbus/agent-endpoint-asset-loader"
  );
  return agentEndpointAssetLoaderModule;
}

function markdownIdentity(reference: MarkdownEndpointReference): string {
  return `${reference.collection}\0${reference.id}\0${reference.surface}`;
}

function markdownRouteIdentity(options: {
  collection: string;
  surface: MarkdownEndpointSurface;
  slug?: string;
}): string {
  return `${options.collection}\0${options.surface}\0${options.slug ?? ""}`;
}

function llmsIdentity(reference: LlmsEndpointReference): string {
  return reference.scope === "site"
    ? `${reference.scope}\0${reference.surface}`
    : `${reference.scope}\0${reference.section}\0${reference.surface}`;
}

async function readAssetBody(
  assetPath: string,
  context: AgentEndpointContext,
): Promise<string> {
  const assets = await loadAgentEndpointAssets();
  const publicPath = withBase(
    `/_nimbus/agent-endpoint-assets/${assetPath}`,
    assets.base,
  );
  const request = context.request;
  if (request) {
    const assetUrl = new URL(publicPath, request.url);
    const { fetchAgentEndpointAsset } = await loadAgentEndpointAssetLoader();
    const response = await fetchAgentEndpointAsset(publicPath, request);
    if (response) {
      if (!response.ok) {
        throw agentEndpointAssetResponseError(assetUrl, response.status);
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
        assets.projectRoot,
        ".astro",
        "nimbus",
        "agent-endpoint-assets",
        assetPath,
      ),
      "utf8",
    );
  } catch (error) {
    if (!request) throw error;
  }
  const assetUrl = new URL(publicPath, request.url);
  const response = await fetch(assetUrl);
  if (!response.ok) {
    throw agentEndpointAssetResponseError(assetUrl, response.status);
  }
  return response.text();
}

async function markdownIndexes() {
  const { markdownAssets } = await loadAgentEndpointAssets();
  if (!markdownByIdentity || !markdownByRoute) {
    markdownByIdentity = new Map();
    markdownByRoute = new Map();
    for (const asset of markdownAssets) {
      markdownByIdentity.set(markdownIdentity(asset), asset);
      markdownByRoute.set(
        markdownRouteIdentity({
          collection: asset.collection,
          surface: asset.surface,
          slug: entryRouteKey(asset.id),
        }),
        asset,
      );
    }
  }
  return { markdownAssets, markdownByIdentity, markdownByRoute };
}

async function llmsIndex() {
  const { llmsAssets } = await loadAgentEndpointAssets();
  if (!llmsByIdentity) {
    llmsByIdentity = new Map(
      llmsAssets.map((asset) => [llmsIdentity(asset), asset]),
    );
  }
  return { llmsAssets, llmsByIdentity };
}

export async function getMarkdownStaticPaths(options: {
  collection: string;
  surface: MarkdownEndpointSurface;
}): Promise<
  Array<{
    params: { slug: string | undefined };
    props: { reference: MarkdownEndpointReference };
    cacheKey: string;
  }>
> {
  const { markdownAssets } = await markdownIndexes();
  return markdownAssets
    .filter(
      (asset) =>
        asset.collection === options.collection &&
        asset.surface === options.surface,
    )
    .map((asset) => ({
      params: { slug: entryRouteKey(asset.id) || undefined },
      props: {
        reference: {
          collection: asset.collection,
          id: asset.id,
          surface: asset.surface,
        } satisfies MarkdownEndpointReference,
      },
      cacheKey: asset.digest,
    }));
}

export async function getMarkdownPayload(options: {
  collection: string;
  surface: MarkdownEndpointSurface;
  slug?: string;
  reference?: MarkdownEndpointReference;
  context?: AgentEndpointContext;
}): Promise<MarkdownEndpointPayload | null> {
  const indexes = await markdownIndexes();
  const asset = options.reference
    ? indexes.markdownByIdentity.get(markdownIdentity(options.reference))
    : indexes.markdownByRoute.get(markdownRouteIdentity(options));
  if (!asset) return null;
  const body = await readAssetBody(asset.path, options.context ?? {});
  return {
    collection: asset.collection,
    id: asset.id,
    surface: asset.surface,
    digest: asset.digest,
    mediaType: asset.mediaType,
    body,
    content: body.slice(asset.contentStart, asset.contentEnd),
  };
}

export async function getLlmsPayload(
  reference: LlmsEndpointReference,
  context: AgentEndpointContext = {},
): Promise<LlmsEndpointPayload | null> {
  const { llmsByIdentity } = await llmsIndex();
  const asset = llmsByIdentity.get(llmsIdentity(reference));
  if (!asset) return null;
  return {
    ...reference,
    digest: asset.digest,
    mediaType: asset.mediaType,
    body: await readAssetBody(asset.path, context),
  };
}

export async function getLlmsStaticPaths(): Promise<
  Array<{
    params: { section: string };
    props: { reference: LlmsEndpointReference };
    cacheKey: string;
  }>
> {
  const { llmsAssets } = await llmsIndex();
  return llmsAssets
    .filter(
      (
        asset,
      ): asset is Extract<
        LlmsEndpointAsset,
        { scope: "section" }
      > => asset.scope === "section" && asset.surface === "index",
    )
    .map((asset) => ({
      params: { section: asset.section },
      props: {
        reference: {
          scope: asset.scope,
          surface: asset.surface,
          section: asset.section,
        } satisfies LlmsEndpointReference,
      },
      cacheKey: asset.digest,
    }));
}
