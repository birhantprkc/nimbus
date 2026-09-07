import { getPreparedLlmsRouteArtifact } from "@cloudflare/nimbus-docs/publication";

export const prerender = true;

export async function GET(context: { request: Request }) {
  const artifact = await getPreparedLlmsRouteArtifact(
    {
      scope: "site",
      surface: "index",
    },
    context,
  );
  if (!artifact) return new Response("Not found", { status: 404 });
  return new Response(artifact.body, {
    headers: { "Content-Type": artifact.mediaType },
  });
}
