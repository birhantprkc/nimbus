import {
  getPreparedLlmsRouteArtifact,
  getPreparedLlmsRouteStaticPaths,
} from "@cloudflare/nimbus-docs/publication";
import type { PreparedLlmsReference } from "@cloudflare/nimbus-docs/types";

export const prerender = true;

interface SectionProps {
  artifact: PreparedLlmsReference;
}

interface SectionContext {
  params: { section?: string };
  props: Partial<SectionProps>;
  request: Request;
}

export const getStaticPaths = async () =>
  getPreparedLlmsRouteStaticPaths();

export async function GET({ params, props, request }: SectionContext) {
  const reference =
    props.artifact ??
    (params.section
      ? ({
          scope: "section",
          surface: "index",
          section: params.section,
        } satisfies PreparedLlmsReference)
      : null);
  if (!reference) return new Response("Not found", { status: 404 });
  const artifact = await getPreparedLlmsRouteArtifact(reference, {
    request,
  });
  if (!artifact) return new Response("Not found", { status: 404 });
  return new Response(artifact.body, {
    headers: { "Content-Type": artifact.mediaType },
  });
}
