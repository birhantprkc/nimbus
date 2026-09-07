import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import {
  normalizeRouteEntrypoint,
  normalizeSourceRouteEntrypoint,
} from "../src/_internal/route-ownership.js";

test("route entrypoints normalize relative, absolute, and file URL identities", () => {
  const root = path.join(path.sep, "workspace", "site");
  const entrypoint = path.join(root, "src", "pages", "foo.astro");
  assert.equal(
    normalizeRouteEntrypoint(root, entrypoint),
    "src/pages/foo.astro",
  );
  assert.equal(
    normalizeRouteEntrypoint(root, pathToFileURL(entrypoint).href),
    "src/pages/foo.astro",
  );
  assert.equal(
    normalizeRouteEntrypoint(root, "src\\pages\\foo.astro"),
    "src/pages/foo.astro",
  );
});

test("source-relative declarations follow a custom Astro srcDir", () => {
  const root = path.join(path.sep, "workspace", "site");
  const srcDir = path.join(root, "app");
  assert.equal(
    normalizeSourceRouteEntrypoint(root, srcDir, "pages/mcp.ts"),
    "app/pages/mcp.ts",
  );
  assert.equal(
    normalizeSourceRouteEntrypoint(root, srcDir, "src/pages/mcp.ts"),
    "app/pages/mcp.ts",
  );
});

test("Windows entrypoints retain stable project-relative identities", () => {
  const root = "C:\\workspace\\site";
  const srcDir = `${root}\\app`;
  assert.equal(
    normalizeRouteEntrypoint(
      root,
      `${root}\\src\\pages\\foo.astro?astro&type=script`,
    ),
    "src/pages/foo.astro",
  );
  assert.equal(
    normalizeSourceRouteEntrypoint(root, srcDir, "pages/mcp.ts"),
    "app/pages/mcp.ts",
  );
});

test("unstable route entrypoint metadata is rejected", () => {
  const root = path.join(path.sep, "workspace", "site");
  assert.equal(normalizeRouteEntrypoint(root, ""), null);
  assert.equal(normalizeRouteEntrypoint(root, null), null);
  assert.equal(normalizeRouteEntrypoint(root, 42), null);
  assert.equal(normalizeRouteEntrypoint(root, "file://%"), null);
  assert.equal(normalizeRouteEntrypoint(root, " virtual:route"), null);
  assert.equal(normalizeRouteEntrypoint(root, "virtual:route"), null);
  assert.equal(normalizeRouteEntrypoint(root, "https://example.com/route"), null);
  assert.equal(normalizeRouteEntrypoint(root, "src/pages/foo.astro\n"), null);
});

test("relative entrypoints resolve to stable project-relative identities", () => {
  const root = path.join(path.sep, "workspace", "site");
  assert.equal(
    normalizeRouteEntrypoint(root, "src/pages/../pages/foo.astro?astro&type=script"),
    "src/pages/foo.astro",
  );
});
