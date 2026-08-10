import { test } from "node:test";
import assert from "node:assert/strict";

import {
  deriveFootprint,
  type FeatureRecipe,
} from "../src/_internal/footprint.js";

const RECIPES: FeatureRecipe[] = [
  {
    id: "loader-notion",
    requires: "static",
    env: [{ name: "NOTION_TOKEN", kind: "build-time" }],
    dep: "@cloudflare/nimbus-loader-notion",
  },
  {
    id: "hosted-mcp",
    requires: "server",
    env: [{ name: "MCP_PROVIDER_TOKEN", kind: "runtime" }],
    dep: "@cloudflare/nimbus-mcp",
  },
];

test("deriveFootprint selects recipes whose dep is present", () => {
  const deps = new Set(["astro", "@cloudflare/nimbus-loader-notion"]);
  const out = deriveFootprint(deps, RECIPES);
  assert.deepEqual(
    out.map((r) => r.id),
    ["loader-notion"],
  );
});

test("deriveFootprint returns nothing when no recipe dep is present", () => {
  const deps = new Set(["astro", "@astrojs/mdx"]);
  assert.deepEqual(deriveFootprint(deps, RECIPES), []);
});

test("deriveFootprint defaults to the (empty) first-party recipe set", () => {
  assert.deepEqual(deriveFootprint(new Set(["anything"])), []);
});
