import { getVisibleEntries } from "@cloudflare/nimbus-docs";
import { OGImageRoute } from "astro-og-canvas";
import { ogCardConfig } from "./_og-card-config";

// Prerender every OG card as a static asset so `output: "server"` doesn't
// turn image generation into an on-demand route.
export const prerender = true;

// Enumerate via the framework projection (not a raw `getCollection`) so gated
// and draft entries are excluded uniformly — otherwise a gated page's title
// would leak as a guessable `/og/<id>.png` even though its page never emits.
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
