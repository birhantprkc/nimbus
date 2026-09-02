import { getCollection } from "astro:content";

import { collectionMountPrefix } from "./collection-mount.js";
import { requestInventoryEntryUrl } from "./request-route-url.js";
import {
  loadApiCollections,
  loadRequestRenderingCollections,
  loadNimbusConfig,
} from "./runtime-config.js";

export const prerender = true;

export async function GET() {
  const config = await loadNimbusConfig();
  const collections = await loadRequestRenderingCollections();
  const apiCollections = new Set(await loadApiCollections());
  const versions = config.versions
    ? { others: config.versions.others ?? [] }
    : null;
  const routes: Array<{ collection: string; url: string }> = [];

  for (const collection of collections) {
    const prefix = collectionMountPrefix(collection, versions);
    const entries = await getCollection(collection as never);
    for (const entry of entries) {
      if ((entry.data as { draft?: unknown }).draft === true) continue;
      routes.push({
        collection,
        url: requestInventoryEntryUrl(
          prefix,
          entry.id,
          apiCollections.has(collection),
        ),
      });
    }
  }

  return new Response(JSON.stringify(routes), {
    headers: { "Content-Type": "application/json" },
  });
}
