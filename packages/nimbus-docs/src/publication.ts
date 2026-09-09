import {
  getLlmsPayload,
  getLlmsStaticPaths,
  getMarkdownPayload,
  getMarkdownStaticPaths,
} from "./agent-endpoints.js";

/** @deprecated Import `getMarkdownPayload` from `@cloudflare/nimbus-docs/agent-endpoints`. */
export const getPreparedMarkdownRouteArtifact = getMarkdownPayload;

/** @deprecated Import `getLlmsPayload` from `@cloudflare/nimbus-docs/agent-endpoints`. */
export const getPreparedLlmsRouteArtifact = getLlmsPayload;

/** @deprecated Import `getMarkdownStaticPaths` from `@cloudflare/nimbus-docs/agent-endpoints`; route props use `reference` instead of `artifact`. */
export async function getPreparedMarkdownRouteStaticPaths(
  options: Parameters<typeof getMarkdownStaticPaths>[0],
) {
  return (await getMarkdownStaticPaths(options)).map(({ props, ...path }) => ({
    ...path,
    props: { artifact: props.reference },
  }));
}

/** @deprecated Import `getLlmsStaticPaths` from `@cloudflare/nimbus-docs/agent-endpoints`; route props use `reference` instead of `artifact`. */
export async function getPreparedLlmsRouteStaticPaths() {
  return (await getLlmsStaticPaths()).map(({ props, ...path }) => ({
    ...path,
    props: { artifact: props.reference },
  }));
}
