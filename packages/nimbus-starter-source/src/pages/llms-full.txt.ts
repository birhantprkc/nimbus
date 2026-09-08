import { getLlmsPayload } from "@cloudflare/nimbus-docs/agent-endpoints";

export const prerender = true;

export async function GET(context: { request: Request }) {
  const payload = await getLlmsPayload(
    {
      scope: "site",
      surface: "full",
    },
    context,
  );
  if (!payload) return new Response("Not found", { status: 404 });
  return new Response(payload.body, {
    headers: { "Content-Type": payload.mediaType },
  });
}
