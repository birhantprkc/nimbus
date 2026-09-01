import { getVisibleEntries } from "@cloudflare/nimbus-docs";
import { OGImageRoute } from "astro-og-canvas";
import { ogCardConfig } from "./_og-card-config";

// Prerender every OG card as a static asset so `output: "server"` doesn't
// turn image generation into an on-demand route.
export const prerender = true;

// Enumerate via the framework projection (not a raw `getCollection`) so draft
// entries are excluded uniformly — a draft page emits no route, so its
// `/og/<id>.png` shouldn't either.
const entries = await getVisibleEntries(["docs"]);

const pages = Object.fromEntries(
  entries.map((entry) => [
    entry.id,
    {
      title: entry.data.title,
      description: entry.data.description ?? "",
    },
  ]),
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    title: page.title,
    description: page.description,
    ...ogCardConfig,
  }),
});
