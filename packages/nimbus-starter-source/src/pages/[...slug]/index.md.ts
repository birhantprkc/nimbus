import {
  getPreparedMarkdownRouteArtifact,
  getPreparedMarkdownRouteStaticPaths,
} from "@cloudflare/nimbus-docs/publication";
import type { PreparedMarkdownReference } from "@cloudflare/nimbus-docs/types";

export const prerender = true;

interface SlugProps {
  artifact: PreparedMarkdownReference;
}

interface SlugContext {
  params: { slug?: string };
  props: Partial<SlugProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  getPreparedMarkdownRouteStaticPaths({
    collection: "docs",
    surface: "markdown",
  });

export async function GET({ params, props, request }: SlugContext) {
  const artifact = await getPreparedMarkdownRouteArtifact({
    collection: "docs",
    surface: "markdown",
    slug: params.slug,
    reference: props.artifact,
    context: { request },
  });
  if (!artifact) return new Response("Not found", { status: 404 });
  return new Response(artifact.body, {
    headers: { "Content-Type": artifact.mediaType },
  });
}
