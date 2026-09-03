/**
 * Tests for `_internal/partial-headings.ts` — the recursive collector that
 * splices `<Render file="..." />` partial headings into the parent page's
 * heading list for TOC generation.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { mergePartialHeadings } from "../src/_internal/partial-headings.js";
import {
  expandWorkerPartials,
  mergeWorkerPartialHeadings,
} from "../src/_internal/worker-partial-headings.js";

import type { Heading } from "../src/_internal/partial-headings.js";

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockEntry {
  id: string;
  body: string;
  headings: Heading[];
  data?: { params?: string[] };
}

function makeGetEntry(partials: Record<string, MockEntry>) {
  return async (collection: string, id: string) => {
    if (collection !== "partials") return undefined;
    return partials[id] ?? null;
  };
}

function makeRender(partials: Record<string, MockEntry>) {
  return async (entry: unknown) => {
    const e = entry as MockEntry;
    return { headings: e.headings };
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("partial heading is inserted between parent headings in document order", async () => {
  const parentBody = `## Before\n\n<Render file="mid" />\n\n## After\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Before", slug: "before" },
    { depth: 2, text: "After", slug: "after" },
  ];
  const partials: Record<string, MockEntry> = {
    mid: {
      id: "mid",
      body: "## Mid heading\n",
      headings: [{ depth: 2, text: "Mid heading", slug: "mid-heading" }],
    },
  };

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["before", "mid-heading", "after"],
  );
});

test("Worker parser preserves partial heading order", async () => {
  const partials: Record<string, MockEntry> = {
    mid: {
      id: "mid",
      body: "## Worker partial\n",
      headings: [{ depth: 2, text: "Worker partial", slug: "worker-partial" }],
    },
  };
  const result = await mergeWorkerPartialHeadings(
    '## Before\n\n<Render file="mid" />\n\n## After\n',
    [
      { depth: 2, text: "Before", slug: "before" },
      { depth: 2, text: "After", slug: "after" },
    ],
    makeGetEntry(partials),
    makeRender(partials),
  );
  assert.deepEqual(
    result.map(({ slug }) => slug),
    ["before", "worker-partial", "after"],
  );
});

test("Worker markdown expansion preserves nested partial content in place", async () => {
  const partials: Record<string, MockEntry> = {
    outer: {
      id: "outer",
      body: 'Outer before.\n\n<Render file="inner" />\n\nOuter after.',
      headings: [],
    },
    inner: {
      id: "inner",
      body: "## Inner heading\n\nSearchable partial sentence.",
      headings: [],
    },
  };
  const expanded = await expandWorkerPartials(
    'Page before.\n\n<Render file="outer" />\n\nPage after.',
    makeGetEntry(partials),
  );

  assert.equal(
    expanded,
    "Page before.\n\nOuter before.\n\n## Inner heading\n\nSearchable partial sentence.\n\nOuter after.\n\nPage after.",
  );
});

test("Worker markdown expansion resolves and forwards declared partial params", async () => {
  const partials: Record<string, MockEntry> = {
    outer: {
      id: "outer",
      body: 'Outer targets {props.runtime}.\n\n<Render file="inner" params={{ runtime: props.runtime }} />',
      headings: [],
      data: { params: ["runtime"] },
    },
    inner: {
      id: "inner",
      body: "Inner targets {props.runtime}.",
      headings: [],
      data: { params: ["runtime"] },
    },
  };
  const expanded = await expandWorkerPartials(
    '<Render file="outer" params={{ runtime: "node" }} />',
    makeGetEntry(partials),
  );

  assert.equal(expanded, "Outer targets node.\n\nInner targets node.");
});

test("Worker markdown expansion validates required partial params", async () => {
  const partials: Record<string, MockEntry> = {
    runtime: {
      id: "runtime",
      body: "Runtime: {props.runtime}",
      headings: [],
      data: { params: ["runtime"] },
    },
  };

  await assert.rejects(
    () =>
      expandWorkerPartials('<Render file="runtime" />', makeGetEntry(partials)),
    /Missing required params \["runtime"\] for "runtime"/,
  );
});

test("nested partial headings are included recursively", async () => {
  const parentBody = `## Parent\n\n<Render file="outer" />\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Parent", slug: "parent" },
  ];
  const partials: Record<string, MockEntry> = {
    outer: {
      id: "outer",
      body: '## Outer\n\n<Render file="inner" />\n',
      headings: [{ depth: 2, text: "Outer", slug: "outer" }],
    },
    inner: {
      id: "inner",
      body: "## Inner\n",
      headings: [{ depth: 2, text: "Inner", slug: "inner" }],
    },
  };

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["parent", "outer", "inner"],
  );

  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["parent", "outer", "inner"],
  );
});

test("missing partial is silently skipped (Render.astro owns the error)", async () => {
  const parentBody = `## Before\n\n<Render file="nonexistent" />\n\n## After\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Before", slug: "before" },
    { depth: 2, text: "After", slug: "after" },
  ];

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["before", "after"],
  );
  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["before", "after"],
  );
});

test("dynamic file expression is ignored", async () => {
  const parentBody = `## Before\n\n<Render file={someVar} />\n\n## After\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Before", slug: "before" },
    { depth: 2, text: "After", slug: "after" },
  ];

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["before", "after"],
  );
  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["before", "after"],
  );
});

test("cyclic partial reference throws a readable error", async () => {
  const parentBody = `## Parent\n\n<Render file="a" />\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Parent", slug: "parent" },
  ];
  const partials: Record<string, MockEntry> = {
    a: {
      id: "a",
      body: `## A\n\n<Render file="b" />\n`,
      headings: [{ depth: 2, text: "A", slug: "a" }],
    },
    b: {
      id: "b",
      body: `## B\n\n<Render file="a" />\n`,
      headings: [{ depth: 2, text: "B", slug: "b" }],
    },
  };

  await assert.rejects(
    () =>
      mergePartialHeadings(
        parentBody,
        parentHeadings,
        makeGetEntry(partials),
        makeRender(partials),
      ),
    /Circular <Render> partial include: a -> b -> a/,
  );
  await assert.rejects(
    () =>
      mergeWorkerPartialHeadings(
        parentBody,
        parentHeadings,
        makeGetEntry(partials),
        makeRender(partials),
      ),
    /Circular <Render> partial include: a -> b -> a/,
  );
});

test("custom resolvePartialId is used (product convention)", async () => {
  const parentBody = `## Before\n\n<Render file="snippet" product="bots" />\n\n## After\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Before", slug: "before" },
    { depth: 2, text: "After", slug: "after" },
  ];
  const partials: Record<string, MockEntry> = {
    "bots/snippet": {
      id: "bots/snippet",
      body: "## Snippet heading\n",
      headings: [
        { depth: 2, text: "Snippet heading", slug: "snippet-heading" },
      ],
    },
  };

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
    {
      resolvePartialId: ({ file, product }) =>
        product ? `${product}/${file}` : file,
    },
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["before", "snippet-heading", "after"],
  );

  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
    {
      resolvePartialId: ({ file, product }) =>
        product ? `${product}/${file}` : file,
    },
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["before", "snippet-heading", "after"],
  );
});

test("Worker parser propagates nested partial resolver failures", async () => {
  const partials: Record<string, MockEntry> = {
    outer: {
      id: "outer",
      body: '<Render file="inner" />',
      headings: [],
    },
  };

  await assert.rejects(
    () =>
      mergeWorkerPartialHeadings(
        '<Render file="outer" />',
        [],
        makeGetEntry(partials),
        makeRender(partials),
        {
          resolvePartialId: ({ file }) => {
            if (file === "inner") throw new Error("resolver failed");
            return file;
          },
        },
      ),
    /resolver failed/,
  );
});

test("extra Astro headings without source nodes are appended (e.g. footnote-label)", async () => {
  const parentBody = `## Before\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Before", slug: "before" },
    { depth: 2, text: "", slug: "footnote-label" },
  ];

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["before", "footnote-label"],
  );

  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["before", "footnote-label"],
  );
});

test("entry with no body returns Astro headings unchanged", async () => {
  const parentHeadings: Heading[] = [{ depth: 2, text: "Foo", slug: "foo" }];

  const result = await mergePartialHeadings(
    undefined,
    parentHeadings,
    makeGetEntry({}),
    makeRender({}),
  );

  assert.deepEqual(result, parentHeadings);
  assert.deepEqual(
    await mergeWorkerPartialHeadings(
      undefined,
      parentHeadings,
      makeGetEntry({}),
      makeRender({}),
    ),
    parentHeadings,
  );
});

test("multiple Render calls in one page are all collected in order", async () => {
  const parentBody = `## First\n\n<Render file="p1" />\n\n## Second\n\n<Render file="p2" />\n\n## Third\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "First", slug: "first" },
    { depth: 2, text: "Second", slug: "second" },
    { depth: 2, text: "Third", slug: "third" },
  ];
  const partials: Record<string, MockEntry> = {
    p1: {
      id: "p1",
      body: "## P1 heading\n",
      headings: [{ depth: 2, text: "P1 heading", slug: "p1-heading" }],
    },
    p2: {
      id: "p2",
      body: "## P2 heading\n",
      headings: [{ depth: 2, text: "P2 heading", slug: "p2-heading" }],
    },
  };

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["first", "p1-heading", "second", "p2-heading", "third"],
  );
  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["first", "p1-heading", "second", "p2-heading", "third"],
  );
});

test("partial with no headings contributes nothing", async () => {
  const parentBody = `## Before\n\n<Render file="empty" />\n\n## After\n`;
  const parentHeadings: Heading[] = [
    { depth: 2, text: "Before", slug: "before" },
    { depth: 2, text: "After", slug: "after" },
  ];
  const partials: Record<string, MockEntry> = {
    empty: { id: "empty", body: "Just some text.\n", headings: [] },
  };

  const result = await mergePartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );

  assert.deepEqual(
    result.map((h) => h.slug),
    ["before", "after"],
  );
  const workerResult = await mergeWorkerPartialHeadings(
    parentBody,
    parentHeadings,
    makeGetEntry(partials),
    makeRender(partials),
  );
  assert.deepEqual(
    workerResult.map((h) => h.slug),
    ["before", "after"],
  );
});

test("Worker parser skips partial render failures", async () => {
  const partials: Record<string, MockEntry> = {
    broken: { id: "broken", body: "## Broken", headings: [] },
  };
  const result = await mergeWorkerPartialHeadings(
    '## Before\n\n<Render file="broken" />\n\n## After',
    [
      { depth: 2, text: "Before", slug: "before" },
      { depth: 2, text: "After", slug: "after" },
    ],
    makeGetEntry(partials),
    async () => {
      throw new Error("render failed");
    },
  );
  assert.deepEqual(
    result.map((heading) => heading.slug),
    ["before", "after"],
  );
});
