/**
 * Per-page `/<slug>/index.mdx` — the raw authored source for every
 * indexable entry of the primary `docs` collection that has a string body.
 *
 * Alternate Markdown/MDX versions: `index.md` is generated Markdown for reading, while
 * `index.mdx` is expanded source with imports, JSX, and directives intact. The
 * body is served verbatim; only the canonical frontmatter block (shared
 * with the `.md` version) is framework-shaped.
 *
 * Non-primary collections (`api`, `blog`, …) follow the same sibling-route
 * convention as `index.md.ts`: their `.mdx` source versions live at
 * `pages/<collection>/[...slug]/index.mdx.ts`.
 */

import {
  getIndexedEntries,
  type IndexedEntry,
  withBase,
} from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

export const prerender = true;

const PRIMARY_COLLECTION = "docs";
const absoluteUrl = (path: string) =>
  new URL(withBase(path, import.meta.env.BASE_URL), config.site).href;

interface SlugProps {
  item: IndexedEntry;
}

export async function getStaticPaths() {
  const indexed = await getIndexedEntries();
  return indexed
    .filter(
      (item) =>
        item.collection === PRIMARY_COLLECTION && item.sourceUrl !== undefined,
    )
    .map((item) => ({
      // Same root-index shape as the `.md` version: `entry.id === "index"`
      // emits at `/index.mdx`, everything else at `/<entry.id>/index.mdx`.
      params: {
        slug: item.entry.id === "index" ? undefined : item.entry.id,
      },
      props: { item } as SlugProps,
    }));
}

export async function GET({ props }: { props: SlugProps }) {
  const { item } = props;
  const { entry, title, description, version } = item;
  const data = (entry.data ?? {}) as Record<string, unknown>;
  const rawImage = data.socialImage;
  const socialImage =
    typeof rawImage === "string" && rawImage.length > 0
      ? rawImage
      : config.socialImage;

  const body = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(description ? [`description: ${JSON.stringify(description)}`] : []),
    ...(socialImage
      ? [`image: ${JSON.stringify(absoluteUrl(socialImage))}`]
      : []),
    ...(version ? [`version: ${JSON.stringify(version)}`] : []),
    "---",
    "",
    entry.body ?? "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
