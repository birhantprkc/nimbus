import {
  getMarkdownPayload,
  getMarkdownStaticPaths,
  type MarkdownEndpointReference,
} from "@cloudflare/nimbus-docs/agent-endpoints";

export const prerender = true;

interface SlugProps {
  reference: MarkdownEndpointReference;
}

interface SlugContext {
  params: { slug?: string };
  props: Partial<SlugProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  getMarkdownStaticPaths({
    collection: "docs",
    surface: "markdown",
  });

export async function GET({ params, props, request }: SlugContext) {
  const payload = await getMarkdownPayload({
    collection: "docs",
    surface: "markdown",
    slug: params.slug,
    reference: props.reference,
    context: { request },
  });
  if (!payload) return new Response("Not found", { status: 404 });
  return new Response(payload.body, {
    headers: { "Content-Type": payload.mediaType },
  });
}
