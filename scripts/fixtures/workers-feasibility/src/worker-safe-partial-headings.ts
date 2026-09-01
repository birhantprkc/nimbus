import { getEntry, render } from "astro:content";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

interface Heading {
  depth: number;
  text: string;
  slug: string;
}

interface Node {
  type: string;
  name?: string | null;
  attributes?: unknown[];
  children?: Node[];
}

interface Attribute {
  type: string;
  name: string;
  value?: string | null | { type: string; value: string };
}

type Slot = { kind: "heading" } | { kind: "render"; file?: string };

const parser = unified().use(remarkParse).use(remarkMdx);

export async function mergeFixturePartialHeadings(
  body: string | undefined,
  headings: Heading[],
): Promise<Heading[]> {
  if (!body) return headings;

  const slots: Slot[] = [];
  collectSlots(parser.parse(body) as unknown as Node, slots);
  const merged: Heading[] = [];
  let headingIndex = 0;

  for (const slot of slots) {
    if (slot.kind === "heading") {
      const heading = headings[headingIndex++];
      if (heading) merged.push(heading);
      continue;
    }

    if (!slot.file) continue;
    const partial = await getEntry("partials", slot.file);
    if (!partial) continue;
    const rendered = await render(partial);
    merged.push(
      ...(await mergeFixturePartialHeadings(partial.body, rendered.headings)),
    );
  }

  merged.push(...headings.slice(headingIndex));
  return merged;
}

function collectSlots(node: Node, slots: Slot[]): void {
  if (node.type === "heading") {
    slots.push({ kind: "heading" });
    return;
  }

  if (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    node.name === "Render"
  ) {
    const file = (node.attributes as Attribute[] | undefined)?.find(
      (attribute) => attribute.type === "mdxJsxAttribute" && attribute.name === "file",
    )?.value;
    slots.push({ kind: "render", file: typeof file === "string" ? file : undefined });
    return;
  }

  for (const child of node.children ?? []) collectSlots(child, slots);
}
