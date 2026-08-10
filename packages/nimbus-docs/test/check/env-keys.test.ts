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

const NO_ENV = new Map<string, string>();

test("missing build-time key is an error (fails the build)", () => {
  const out = checkFeatureEnvKeys([loader], {}, NO_ENV);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.severity, "error");
  assert.equal(out[0]!.code, "nimbus/env-build-time-missing");
  assert.match(out[0]!.message, /NOTION_TOKEN/);
});

test("missing runtime key is a warning (builds green)", () => {
  const out = checkFeatureEnvKeys([mcp], {}, NO_ENV);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.severity, "warn");
  assert.equal(out[0]!.code, "nimbus/env-runtime-missing");
});

test("a key present in process.env is satisfied", () => {
  const out = checkFeatureEnvKeys([loader], { NOTION_TOKEN: "secret" }, NO_ENV);
  assert.deepEqual(out, []);
});

test("a key present only in .env is satisfied", () => {
  const out = checkFeatureEnvKeys(
    [loader],
    {},
    new Map([["NOTION_TOKEN", "secret"]]),
  );
  assert.deepEqual(out, []);
});

test("an empty/whitespace value counts as missing", () => {
  assert.equal(
    checkFeatureEnvKeys([loader], { NOTION_TOKEN: "" }, NO_ENV).length,
    1,
  );
  assert.equal(
    checkFeatureEnvKeys([loader], { NOTION_TOKEN: "  " }, NO_ENV).length,
    1,
  );
});

test("process.env wins over a blank .env entry", () => {
  const out = checkFeatureEnvKeys(
    [loader],
    { NOTION_TOKEN: "shell-secret" },
    new Map([["NOTION_TOKEN", ""]]),
  );
  assert.deepEqual(out, []);
});

test("a blank shell var does not mask a real value from .env", () => {
  const out = checkFeatureEnvKeys(
    [loader],
    { NOTION_TOKEN: "" },
    new Map([["NOTION_TOKEN", "file-secret"]]),
  );
  assert.deepEqual(out, []);
});

test("no installed features → no env findings (not false-green: nothing is required)", () => {
  assert.deepEqual(checkFeatureEnvKeys([], {}, NO_ENV), []);
});
