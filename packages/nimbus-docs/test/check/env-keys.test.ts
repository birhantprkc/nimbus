import { test } from "node:test";
import assert from "node:assert/strict";

import { checkFeatureEnvKeys } from "../../src/check/env.js";
import type { FeatureRecipe } from "../../src/_internal/footprint.js";

const loader: FeatureRecipe = {
  id: "loader-notion",
  requires: "static",
  env: [{ name: "NOTION_TOKEN", kind: "build-time" }],
  dep: "@cloudflare/nimbus-loader-notion",
};

const mcp: FeatureRecipe = {
  id: "hosted-mcp",
  requires: "server",
  env: [{ name: "MCP_PROVIDER_TOKEN", kind: "runtime" }],
  dep: "@cloudflare/nimbus-mcp",
};

test("missing build-time key is an error (fails the build)", () => {
  const out = checkFeatureEnvKeys([loader], {});
  assert.equal(out.length, 1);
  assert.equal(out[0]!.severity, "error");
  assert.equal(out[0]!.code, "nimbus/env-build-time-missing");
  assert.match(out[0]!.message, /NOTION_TOKEN/);
});

test("missing runtime key is a warning (builds green)", () => {
  const out = checkFeatureEnvKeys([mcp], {});
  assert.equal(out.length, 1);
  assert.equal(out[0]!.severity, "warn");
  assert.equal(out[0]!.code, "nimbus/env-runtime-missing");
});

test("a key present in process.env is satisfied", () => {
  const out = checkFeatureEnvKeys([loader], { NOTION_TOKEN: "secret" });
  assert.deepEqual(out, []);
});

test("a key present in the resolved build environment is satisfied", () => {
  const out = checkFeatureEnvKeys([loader], { NOTION_TOKEN: "secret" });
  assert.deepEqual(out, []);
});

test("an empty/whitespace value counts as missing", () => {
  assert.equal(
    checkFeatureEnvKeys([loader], { NOTION_TOKEN: "" }).length,
    1,
  );
  assert.equal(
    checkFeatureEnvKeys([loader], { NOTION_TOKEN: "  " }).length,
    1,
  );
});

test("a blank resolved value is missing", () => {
  const out = checkFeatureEnvKeys([loader], { NOTION_TOKEN: "" });
  assert.equal(out.length, 1);
  assert.equal(out[0]!.code, "nimbus/env-build-time-missing");
});

test("no installed features → no env findings (not false-green: nothing is required)", () => {
  assert.deepEqual(checkFeatureEnvKeys([], {}), []);
});
