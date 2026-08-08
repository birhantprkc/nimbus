/**
 * Sitemap `customPages` run through the same public projection as every other
 * emission surface. The URLs carry the configured `base` (it's baked into
 * `config.site`), so the filter must strip `base` before matching a gated glob
 * against the collection-relative entry id — otherwise every gate misses under
 * a non-root base.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { filterProjectedCustomPages } from "../src/integration.js";
import type { NimbusConfig } from "../src/types.js";

const config = (over: Partial<NimbusConfig>): NimbusConfig =>
  ({ site: "https://example.com/docs/", title: "T", ...over }) as NimbusConfig;

test("strips base before matching gated globs against the entry id", () => {
  const pages = [
    "https://example.com/docs/guide/",
    "https://example.com/docs/internal/secret/",
  ];
  const kept = filterProjectedCustomPages(pages, config({ gated: ["internal/**"] }), "/docs");
  assert.deepEqual(kept, ["https://example.com/docs/guide/"]);
});

test("no base: matches at the root", () => {
  const pages = [
    "https://example.com/guide/",
    "https://example.com/internal/secret/",
  ];
  const cfg = config({ site: "https://example.com/", gated: ["internal/**"] });
  const kept = filterProjectedCustomPages(pages, cfg, "");
  assert.deepEqual(kept, ["https://example.com/guide/"]);
});

test("tolerates base with surrounding slashes and a root base", () => {
  const pages = [
    "https://example.com/docs/guide/",
    "https://example.com/docs/internal/x/",
  ];
  for (const base of ["/docs/", "docs", "/docs"]) {
    const kept = filterProjectedCustomPages(pages, config({ gated: ["internal/**"] }), base);
    assert.deepEqual(kept, ["https://example.com/docs/guide/"], base);
  }
  const rootPages = ["https://example.com/guide/", "https://example.com/internal/x/"];
  const cfg = config({ site: "https://example.com/", gated: ["internal/**"] });
  assert.deepEqual(filterProjectedCustomPages(rootPages, cfg, "/"), [
    "https://example.com/guide/",
  ]);
});

test("strips a non-primary collection mount prefix before gating", () => {
  const pages = [
    "https://example.com/blog/public-post/",
    "https://example.com/blog/internal/secret/",
  ];
  const kept = filterProjectedCustomPages(
    pages,
    config({ gated: ["internal/**"] }),
    "",
    ["docs", "blog"],
  );
  assert.deepEqual(kept, ["https://example.com/blog/public-post/"]);
});

test("a docs page whose path resembles a collection is NOT stripped (only registered mounts)", () => {
  // No `blog` collection registered → `/blog/internal/x` is a docs entry id
  // `blog/internal/x`, which `internal/**` must not match.
  const pages = ["https://example.com/blog/internal/x/"];
  const kept = filterProjectedCustomPages(pages, config({ gated: ["internal/**"] }), "", ["docs"]);
  assert.deepEqual(kept, pages);
});

test("decodes percent-encoded path segments before gating", () => {
  const pages = [
    "https://example.com/docs/public/",
    "https://example.com/docs/internal%20pages/secret/",
  ];
  const kept = filterProjectedCustomPages(
    pages,
    config({ site: "https://example.com/docs/", gated: ["internal pages/**"] }),
    "/docs",
    ["docs"],
  );
  assert.deepEqual(kept, ["https://example.com/docs/public/"]);
});

test("strips a percent-encoded / non-ASCII base before gating", () => {
  const pages = [
    "https://example.com/%C3%BCber/public/",
    "https://example.com/%C3%BCber/internal/secret/",
  ];
  const kept = filterProjectedCustomPages(
    pages,
    config({ site: "https://example.com/%C3%BCber/", gated: ["internal/**"] }),
    "/über",
    ["docs"],
  );
  assert.deepEqual(kept, ["https://example.com/%C3%BCber/public/"]);
});

test("no gated globs is a passthrough", () => {
  const pages = ["https://example.com/docs/a/", "https://example.com/docs/b/"];
  assert.deepEqual(filterProjectedCustomPages(pages, config({}), "/docs"), pages);
});
