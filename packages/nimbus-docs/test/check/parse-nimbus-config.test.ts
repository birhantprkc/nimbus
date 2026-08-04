import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  parseNimbusConfig,
  evaluateLiteral,
  rewriteConfigField,
  type ConfigParseResult,
} from "../../src/_internal/parse-nimbus-config.js";

function withConfig<T>(
  source: string,
  body: (dir: string) => T,
  filename = "astro.config.ts",
): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-cfg-"));
  fs.writeFileSync(path.join(dir, filename), source);
  try {
    return body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function parse(source: string, filename?: string): ConfigParseResult {
  return withConfig(source, (dir) => parseNimbusConfig(dir), filename);
}

function ok(result: ConfigParseResult) {
  assert.ok(result.ok, `expected ok, got ${result.ok ? "" : result.reason}`);
  return result as Extract<ConfigParseResult, { ok: true }>;
}

const IMPORT = `import nimbus from "@cloudflare/nimbus-docs";`;
const WRAP_IMPORT = `import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";`;

test("inline object literal resolves site and title", () => {
  const r = ok(
    parse(`${IMPORT}
export default { integrations: [nimbus({ site: "https://x.dev", title: "X" })] };`),
  );
  assert.equal(r.config.site, "https://x.dev");
  assert.equal(r.config.title, "X");
  assert.equal(r.unresolved.length, 0);
  assert.ok(r.location.fields.has("site"));
});

test("single-arg defineNimbusConfig wrapper resolves", () => {
  const r = ok(
    parse(`${WRAP_IMPORT}
const cfg = defineNimbusConfig({ site: "https://x.dev", title: "X" });
export default { integrations: [nimbus(cfg)] };`),
  );
  assert.equal(r.config.site, "https://x.dev");
});

test("const reference to a plain object resolves", () => {
  const r = ok(
    parse(`${IMPORT}
const cfg = { site: "https://x.dev", title: "X" };
export default { integrations: [nimbus(cfg)] };`),
  );
  assert.equal(r.config.title, "X");
});

test("aliased default import is followed", () => {
  const r = ok(
    parse(`import nb, { defineConfig as d } from "@cloudflare/nimbus-docs";
export default { integrations: [nb({ site: "https://x.dev", title: "X" })] };`),
  );
  assert.equal(r.config.site, "https://x.dev");
});

test("`default as` named default import is followed", () => {
  const r = ok(
    parse(`import { default as nimbus } from "@cloudflare/nimbus-docs";
export default { integrations: [nimbus({ site: "https://x.dev", title: "X" })] };`),
  );
  assert.equal(r.config.site, "https://x.dev");
});

test("quoted keys resolve (masked would blank the interior)", () => {
  const r = ok(
    parse(`${IMPORT}
export default { integrations: [nimbus({ "site": "https://x.dev", 'title': "X" })] };`),
  );
  assert.equal(r.config.site, "https://x.dev");
  assert.equal(r.config.title, "X");
});

test("a `site` URL containing // is not treated as a comment", () => {
  const r = ok(
    parse(`${IMPORT}
export default { integrations: [nimbus({ site: "https://x.dev/a", title: "X" })] };`),
  );
  assert.equal(r.config.site, "https://x.dev/a");
});

test("missing config file → no-config-file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-cfg-"));
  try {
    const r = parseNimbusConfig(dir);
    assert.equal(r.ok, false);
    assert.equal((r as { reason: string }).reason, "no-config-file");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("no default import of the package → no-import", () => {
  const r = parse(`import { defineConfig } from "@cloudflare/nimbus-docs";
export default defineConfig({});`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-import");
});

test("subpath-only import does not satisfy the default import", () => {
  const r = parse(`import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
export default { integrations: [] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-import");
});

test("mismatched import quotes are rejected", () => {
  const r = parse(`import nimbus from "@cloudflare/nimbus-docs';
export default { integrations: [nimbus({ site: "x" })] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-import");
});

test("`from \"pkg\"` inside a comment is not a real import", () => {
  const r = parse(`// import nimbus from "@cloudflare/nimbus-docs";
export default { integrations: [] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-import");
});

test("empty nimbus() call → no-call (not a false green)", () => {
  const r = parse(`${IMPORT}
export default { integrations: [nimbus()] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-call");
});

test("member call x.nimbus({...}) is skipped", () => {
  const r = parse(`${IMPORT}
const x = { nimbus: (c) => c };
export default { integrations: [x.nimbus({ site: "y" })] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-call");
});

test("computed config argument → no-object", () => {
  const r = parse(`${IMPORT}
function build() { return { site: "x" }; }
export default { integrations: [nimbus(build())] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-object");
});

test("multi-arg wrapper is rejected → no-object", () => {
  const r = parse(`${WRAP_IMPORT}
const cfg = defineNimbusConfig({ site: "x" }, { extra: true });
export default { integrations: [nimbus(cfg)] };`);
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "no-object");
});

test("computed field lands in unresolved, not config", () => {
  const r = ok(
    parse(`${IMPORT}
const base = "https://x.dev";
export default { integrations: [nimbus({ site: base, title: "X" })] };`),
  );
  assert.ok(r.unresolved.includes("site"));
  assert.equal(r.config.site, undefined);
  assert.equal(r.config.title, "X");
});

test("spread is reported as ...spread in unresolved", () => {
  const r = ok(
    parse(`${IMPORT}
const base = { title: "X" };
export default { integrations: [nimbus({ ...base, site: "https://x.dev" })] };`),
  );
  assert.ok(r.unresolved.includes("...spread"));
  assert.equal(r.config.site, "https://x.dev");
});

test("nested objects and arrays resolve", () => {
  const r = ok(
    parse(`${IMPORT}
export default { integrations: [nimbus({
  site: "https://x.dev",
  versions: { others: ["v1", "v2"] },
  flags: [true, false, 3],
})] };`),
  );
  assert.deepEqual(r.config.versions, { others: ["v1", "v2"] });
  assert.deepEqual(r.config.flags, [true, false, 3]);
});

test("locates the config even with alternate config filenames", () => {
  const r = ok(
    parse(
      `${IMPORT}
export default { integrations: [nimbus({ site: "https://x.dev" })] };`,
      "astro.config.mjs",
    ),
  );
  assert.equal(r.config.site, "https://x.dev");
});

test("rewriteConfigField replaces a literal value", () => {
  const source = `${IMPORT}
export default { integrations: [nimbus({ site: "https://example.com", title: "X" })] };`;
  const r = ok(parse(source));
  const next = rewriteConfigField(r.location, "site", "https://docs.example.com");
  assert.match(next, /site: "https:\/\/docs\.example\.com"/);
  assert.match(next, /title: "X"/);
  const reparsed = ok(
    withConfig(next, (dir) => parseNimbusConfig(dir)),
  );
  assert.equal(reparsed.config.site, "https://docs.example.com");
});

test("rewriteConfigField throws for an unknown field", () => {
  const r = ok(
    parse(`${IMPORT}
export default { integrations: [nimbus({ site: "https://x.dev" })] };`),
  );
  assert.throws(() => rewriteConfigField(r.location, "title", "Y"));
});
