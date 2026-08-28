// The HTML-path seam: the citation Vite plugin's `transform`. Exercises the
// exact behavior an `astro build` relies on — content-dir scoping, the
// `hasCitation` short-circuit, resolution rewrite, and the build-fail throw on
// an unresolved author citation into a known collection.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { citationPlugin } from "../src/_internal/api/citation-vite-plugin.js";

const CONTENT = path.resolve("/tmp/nimbus-content");
const index = new Map<string, string>([
  ["zones:createZone", "/api/zones/create-zone"],
]);

function makePlugin() {
  return citationPlugin({ contentDirs: [CONTENT], getCitationIndex: () => index });
}

const inScope = path.join(CONTENT, "guide.mdx");

describe("citationPlugin.transform", () => {
  test("rewrites a resolvable citation in an in-scope file", () => {
    const out = makePlugin().transform(
      "See [create](api.ref:zones:createZone).",
      inScope,
    );
    assert.ok(out && typeof out === "object");
    assert.match((out as { code: string }).code, /\[create\]\(\/api\/zones\/create-zone\)/);
  });

  test("build-fails on an unresolved citation into a known collection", () => {
    assert.throws(
      () => makePlugin().transform("[x](api.ref:zones:deleteZone)", inScope),
      /unresolved API citation/,
    );
  });

  test("passes through a file outside the content dirs untouched", () => {
    const out = makePlugin().transform(
      "[x](api.ref:zones:deleteZone)",
      "/somewhere/else/node_modules/pkg/readme.md",
    );
    assert.equal(out, null);
  });

  test("no-ops (returns null) when the file has no citation", () => {
    const out = makePlugin().transform("Just **prose**.", inScope);
    assert.equal(out, null);
  });

  test("ignores non-markdown ids and strips query suffixes when scoping", () => {
    assert.equal(makePlugin().transform("[x](api.ref:zones:createZone)", path.join(CONTENT, "x.ts")), null);
    const out = makePlugin().transform(
      "[create](api.ref:zones:createZone)",
      `${inScope}?astro&type=content`,
    );
    assert.match((out as { code: string }).code, /\/api\/zones\/create-zone/);
  });
});
