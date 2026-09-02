import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  Heading,
  PartialHeadingOptions,
} from "./partial-headings.js";

interface MdNode {
  type: string;
  name?: string | null;
  attributes?: unknown[];
  children?: MdNode[];
}

interface JsxAttribute {
  type: string;
  name: string;
  value?: string | null | { type: string; value: string };
}

type Slot =
  | { kind: "heading" }
  | { kind: "render"; file?: string; product?: string };

const parser = unified().use(remarkParse).use(remarkMdx);

export function mergeWorkerPartialHeadings(
  body: string | undefined,
  astroHeadings: Heading[],
  getEntry: (collection: string, id: string) => Promise<unknown>,
  render: (entry: unknown) => Promise<{ headings: Heading[] }>,
  options?: PartialHeadingOptions,
): Promise<Heading[]> {
  return merge(body, astroHeadings, getEntry, render, options, new Set());
}

async function merge(
  body: string | undefined,
  astroHeadings: Heading[],
  getEntry: (collection: string, id: string) => Promise<unknown>,
  render: (entry: unknown) => Promise<{ headings: Heading[] }>,
  options: PartialHeadingOptions | undefined,
  seen: Set<string>,
): Promise<Heading[]> {
  if (!body) return astroHeadings;

  let tree: MdNode;
  try {
    tree = parser.parse(body) as unknown as MdNode;
  } catch {
    return astroHeadings;
  }

  const slots: Slot[] = [];
  collectSlots(tree, slots);
  const merged: Heading[] = [];
  let headingIndex = 0;

  for (const slot of slots) {
    if (slot.kind === "heading") {
      const heading = astroHeadings[headingIndex++];
      if (heading) merged.push(heading);
      continue;
    }

    const id = (options?.resolvePartialId ?? ((attrs) => attrs.file))({
      file: slot.file,
      product: slot.product,
    });
    if (!id) continue;
    if (seen.has(id)) {
      throw new Error(
        `[nimbus-docs] Circular <Render> partial include: ${[...seen, id].join(" -> ")}. ` +
          "Check for a partial that renders itself directly or transitively.",
      );
    }

    let partial: unknown;
    try {
      partial = await getEntry("partials", id);
    } catch {
      continue;
    }
    if (!partial) continue;

    seen.add(id);
    try {
      const rendered = await render(partial);
      merged.push(
        ...(await merge(
          (partial as { body?: string }).body,
          rendered.headings,
          getEntry,
          render,
          options,
          seen,
        )),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("Circular <Render>")) {
        throw error;
      }
    } finally {
      seen.delete(id);
    }
  }

  merged.push(...astroHeadings.slice(headingIndex));
  return merged;
}

function collectSlots(node: MdNode, slots: Slot[]): void {
  if (node.type === "heading") {
    slots.push({ kind: "heading" });
    return;
  }
  if (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    node.name === "Render"
  ) {
    const attributes = node.attributes as JsxAttribute[] | undefined;
    const value = (name: string) => {
      const attribute = attributes?.find(
        (candidate) =>
          candidate.type === "mdxJsxAttribute" && candidate.name === name,
      )?.value;
      return typeof attribute === "string" ? attribute : undefined;
    };
    slots.push({ kind: "render", file: value("file"), product: value("product") });
    return;
  }
  for (const child of node.children ?? []) collectSlots(child, slots);
}
