import assert from "node:assert/strict";
import { test } from "node:test";

import {
  pagefindDocument,
  pagefindMarkdown,
} from "../src/_internal/pagefind-document.js";

test("synthetic Pagefind Markdown preserves headings as subresult anchors", () => {
  const html = pagefindMarkdown(
    "Intro.\n\n## Partial heading\n\nBody.\n\n## Partial heading\n\n```md\n## Not a heading\n```",
  );

  assert.match(html, /<h2 id="partial-heading">Partial heading<\/h2>/);
  assert.match(html, /<h2 id="partial-heading-1">Partial heading<\/h2>/);
  assert.doesNotMatch(html, /<h2 id="not-a-heading">/);
  assert.match(html, /<pre>[\s\S]*## Not a heading[\s\S]*<\/pre>/);
});

test("synthetic Pagefind document retains route metadata and heading HTML", () => {
  const html = pagefindDocument({
    url: "/v1/runtime/",
    title: "Runtime",
    description: "Request-rendered content",
    content: "## Configure it\n\nSearchable text.",
    language: "en",
    version: "v1",
    deprecated: true,
  });

  assert.match(html, /data-pagefind-filter="version:v1"/);
  assert.match(html, /data-pagefind-filter="status:deprecated"/);
  assert.match(html, /<h2 id="configure-it">Configure it<\/h2>/);
});
