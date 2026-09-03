import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type { Heading, PartialHeadingOptions } from "./partial-headings.js";

interface MdNode {
  type: string;
  name?: string | null;
  attributes?: unknown[];
  children?: MdNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
}

interface JsxAttribute {
  type: string;
  name: string;
  value?: string | null | MdxExpression;
}

interface MdxExpression {
  type: string;
  value: string;
  data?: { estree?: EstreeProgram };
}

interface EstreeProgram {
  body?: Array<{ type: string; expression?: EstreeExpression }>;
}

interface EstreeExpression {
  type: string;
  value?: unknown;
  name?: string;
  computed?: boolean;
  operator?: string;
  argument?: EstreeExpression;
  object?: EstreeExpression;
  property?: EstreeExpression;
  properties?: EstreeProperty[];
  elements?: Array<EstreeExpression | null>;
  expressions?: EstreeExpression[];
  quasis?: Array<{ value?: { cooked?: string | null } }>;
}

interface EstreeProperty {
  type: string;
  computed?: boolean;
  key?: EstreeExpression;
  value?: EstreeExpression;
}

type Slot =
  { kind: "heading" } | { kind: "render"; file?: string; product?: string };

const parser = unified().use(remarkParse).use(remarkMdx);

export function expandWorkerPartials(
  body: string,
  getEntry: (collection: string, id: string) => Promise<unknown>,
): Promise<string> {
  return expandPartials(body, getEntry, {}, new Set());
}

async function expandPartials(
  body: string,
  getEntry: (collection: string, id: string) => Promise<unknown>,
  props: Record<string, unknown>,
  seen: Set<string>,
): Promise<string> {
  let tree: MdNode;
  try {
    tree = parser.parse(body) as unknown as MdNode;
  } catch {
    return body;
  }

  const renders: MdNode[] = [];
  collectRenderNodes(tree, renders);
  const replacements: Array<{ start: number; end: number; body: string }> = [];

  for (const node of renders) {
    const id = attributeValue(node, "file");
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!id || start === undefined || end === undefined) continue;
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
      partial = null;
    }
    const partialBody = (partial as { body?: unknown } | null)?.body;
    if (typeof partialBody !== "string") continue;
    const partialProps = renderParams(node, props);
    validatePartialParams(id, partial, partialProps);

    seen.add(id);
    try {
      replacements.push({
        start,
        end,
        body: await expandPartials(
          applyPartialParams(partialBody, partialProps),
          getEntry,
          partialProps,
          seen,
        ),
      });
    } finally {
      seen.delete(id);
    }
  }

  let expanded = body;
  for (const replacement of replacements.reverse()) {
    expanded =
      expanded.slice(0, replacement.start) +
      replacement.body +
      expanded.slice(replacement.end);
  }
  return expanded;
}

function renderParams(
  node: MdNode,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const attribute = (node.attributes as JsxAttribute[] | undefined)?.find(
    (candidate) =>
      candidate.type === "mdxJsxAttribute" && candidate.name === "params",
  );
  if (!attribute) return {};
  if (!attribute.value || typeof attribute.value === "string") {
    throw new Error(
      "[nimbus-docs] <Render> params must be an object expression.",
    );
  }
  const expression = estreeExpression(attribute.value);
  if (expression?.type !== "ObjectExpression") {
    throw new Error(
      "[nimbus-docs] <Render> params must be a statically resolvable object expression.",
    );
  }
  return evaluateObject(expression, props);
}

function validatePartialParams(
  id: string,
  partial: unknown,
  props: Record<string, unknown>,
): void {
  const declared = (partial as { data?: { params?: unknown } } | null)?.data
    ?.params;
  if (
    !Array.isArray(declared) ||
    !declared.every((item) => typeof item === "string")
  ) {
    return;
  }
  const required = declared.filter((param) => !param.endsWith("?"));
  const names = new Set(
    declared.map((param) => (param.endsWith("?") ? param.slice(0, -1) : param)),
  );
  const received = Object.keys(props);
  const missing = required.filter((param) => !received.includes(param));
  if (missing.length > 0) {
    throw new Error(
      `[Render] Missing required params ${JSON.stringify(missing)} for "${id}". ` +
        `Expected: ${JSON.stringify(declared)}, received: ${JSON.stringify(received)}`,
    );
  }
  const unexpected = received.filter((param) => !names.has(param));
  if (unexpected.length > 0) {
    throw new Error(
      `[Render] Unexpected params ${JSON.stringify(unexpected)} for "${id}". ` +
        `Declared: ${JSON.stringify(declared)}`,
    );
  }
}

function applyPartialParams(
  body: string,
  props: Record<string, unknown>,
): string {
  let tree: MdNode;
  try {
    tree = parser.parse(body) as unknown as MdNode;
  } catch {
    return body;
  }
  const expressions: MdNode[] = [];
  collectExpressions(tree, expressions);
  const replacements: Array<{ start: number; end: number; body: string }> = [];
  for (const node of expressions) {
    const expression = estreeExpression(node as unknown as MdxExpression);
    const name = propsMemberName(expression);
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (!name || start === undefined || end === undefined) continue;
    replacements.push({ start, end, body: markdownValue(props[name]) });
  }
  let rendered = body;
  for (const replacement of replacements.reverse()) {
    rendered =
      rendered.slice(0, replacement.start) +
      replacement.body +
      rendered.slice(replacement.end);
  }
  return rendered;
}

function collectExpressions(node: MdNode, expressions: MdNode[]): void {
  if (node.type === "mdxTextExpression" || node.type === "mdxFlowExpression") {
    expressions.push(node);
    return;
  }
  for (const child of node.children ?? [])
    collectExpressions(child, expressions);
}

function estreeExpression(
  expression: MdxExpression,
): EstreeExpression | undefined {
  const statement = expression.data?.estree?.body?.[0];
  return statement?.type === "ExpressionStatement"
    ? statement.expression
    : undefined;
}

function propsMemberName(
  expression: EstreeExpression | undefined,
): string | undefined {
  if (
    expression?.type !== "MemberExpression" ||
    expression.object?.type !== "Identifier" ||
    expression.object.name !== "props"
  ) {
    return undefined;
  }
  if (!expression.computed && expression.property?.type === "Identifier") {
    return expression.property.name;
  }
  return expression.computed && expression.property?.type === "Literal"
    ? String(expression.property.value)
    : undefined;
}

function evaluateObject(
  expression: EstreeExpression,
  props: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const property of expression.properties ?? []) {
    if (
      property.type !== "Property" ||
      property.computed ||
      !property.key ||
      !property.value
    ) {
      throw new Error(
        "[nimbus-docs] <Render> params contains an unsupported property.",
      );
    }
    const key =
      property.key.type === "Identifier"
        ? property.key.name
        : property.key.type === "Literal"
          ? String(property.key.value)
          : undefined;
    if (!key) {
      throw new Error(
        "[nimbus-docs] <Render> params contains an unsupported property name.",
      );
    }
    result[key] = evaluateExpression(property.value, props);
  }
  return result;
}

function evaluateExpression(
  expression: EstreeExpression,
  props: Record<string, unknown>,
): unknown {
  if (expression.type === "Literal") return expression.value;
  const prop = propsMemberName(expression);
  if (prop) return props[prop];
  if (expression.type === "Identifier" && expression.name === "undefined") {
    return undefined;
  }
  if (expression.type === "ArrayExpression") {
    return (expression.elements ?? []).map((item) =>
      item ? evaluateExpression(item, props) : undefined,
    );
  }
  if (expression.type === "ObjectExpression")
    return evaluateObject(expression, props);
  if (expression.type === "UnaryExpression" && expression.argument) {
    const value = evaluateExpression(expression.argument, props);
    if (expression.operator === "-") return -Number(value);
    if (expression.operator === "+") return Number(value);
    if (expression.operator === "!") return !value;
  }
  if (
    expression.type === "TemplateLiteral" &&
    expression.expressions?.length === 0
  ) {
    return expression.quasis?.[0]?.value?.cooked ?? "";
  }
  throw new Error(
    "[nimbus-docs] <Render> params must contain only literals or props.<name> references.",
  );
}

function markdownValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" || typeof value === "function") {
    throw new Error(
      "[nimbus-docs] Partial props interpolated into Markdown must be primitive values.",
    );
  }
  return String(value).replace(/([\\`*_[\]{}()<>#+.!|~-])/g, "\\$1");
}

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
  if (!body || !body.includes("<Render")) return astroHeadings;

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

    let rendered: { headings: Heading[] };
    try {
      rendered = await render(partial);
    } catch {
      continue;
    }

    seen.add(id);
    try {
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
    slots.push({
      kind: "render",
      file: value("file"),
      product: value("product"),
    });
    return;
  }
  for (const child of node.children ?? []) collectSlots(child, slots);
}

function collectRenderNodes(node: MdNode, renders: MdNode[]): void {
  if (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
    node.name === "Render"
  ) {
    renders.push(node);
    return;
  }
  for (const child of node.children ?? []) collectRenderNodes(child, renders);
}

function attributeValue(node: MdNode, name: string): string | undefined {
  const attribute = (node.attributes as JsxAttribute[] | undefined)?.find(
    (candidate) =>
      candidate.type === "mdxJsxAttribute" && candidate.name === name,
  )?.value;
  return typeof attribute === "string" ? attribute : undefined;
}
