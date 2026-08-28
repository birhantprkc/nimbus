// The URL-segment breadcrumb fallback (untracked pages) decodes percent-encoded
// segments so CJK paths read as text, not `%E6%8C%87...`.

import assert from "node:assert/strict";
import { test } from "node:test";

import { breadcrumbsFromUrl } from "../src/_internal/navigation.js";

test("decodes percent-encoded (CJK) segments into readable labels", () => {
  const crumbs = breadcrumbsFromUrl("/%E6%8C%87%E5%8D%97");
  assert.deepEqual(
    crumbs.map((c) => c.label),
    ["Home", "指南"],
  );
});

test("title-cases hyphenated ascii segments as before", () => {
  const crumbs = breadcrumbsFromUrl("/getting-started");
  assert.equal(crumbs.at(-1)?.label, "Getting Started");
});

test("does not throw on malformed percent sequences", () => {
  assert.doesNotThrow(() => breadcrumbsFromUrl("/bad%zz"));
});
