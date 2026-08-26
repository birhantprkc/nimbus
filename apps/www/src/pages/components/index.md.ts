/**
 * Static markdown alternate for /components/. Mirrors what the dynamic
 * `[...slug]/index.md.ts` route does for content entries, but for the
 * hand-written /components page.
 */
import { withBase } from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";

export const prerender = true;

const absoluteUrl = (path: string) =>
  new URL(withBase(path, import.meta.env.BASE_URL), config.site).href;

const components = [
  "Aside", "Badge", "Card / CardGrid", "LayerCard", "Frame", "Embed",
  "FileTree", "LinkCard", "LinkButton", "Code", "CodeGroup",
  "PackageManagers", "Steps / Step", "Accordion", "Collapsible", "Tabs",
  "Popover", "Dialog",
];

export function GET() {
  const body = [
    "---",
    `title: "Components"`,
    `description: "Every Nimbus component, rendered with every variant."`,
    "---",
    "",
    "> Documentation Index",
    `> Fetch the complete documentation index at: ${absoluteUrl("/llms.txt")}`,
    "> Use this file to discover all available pages before exploring further.",
    "",
    "# Components",
    "",
    "Every Nimbus component, rendered with every variant.",
    "",
    ...components.map((c) => `- ${c}`),
    "",
    `Source: ${absoluteUrl("/components/index.md")}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
