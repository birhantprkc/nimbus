import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { isAbsoluteHttpUrl } from "../../src/_internal/validate.js";
import {
  depInstalled,
  hasPackageJson,
  readDependencyNames,
} from "../../src/check/probe.js";
import { deriveFootprint } from "../../src/_internal/footprint.js";

test("isAbsoluteHttpUrl accepts real absolute http(s) URLs", () => {
  assert.equal(isAbsoluteHttpUrl("https://docs.example.com"), true);
  assert.equal(isAbsoluteHttpUrl("http://localhost:4321"), true);
  assert.equal(isAbsoluteHttpUrl("https://example.com/base/path"), true);
});

test("isAbsoluteHttpUrl rejects a missing // (the https:example.com trap)", () => {
  // `new URL("https:example.com")` does NOT throw — this is the whole point.
  assert.equal(isAbsoluteHttpUrl("https:example.com"), false);
});

test("isAbsoluteHttpUrl rejects non-http schemes, hostless, and garbage", () => {
  assert.equal(isAbsoluteHttpUrl("ftp://example.com"), false);
  assert.equal(isAbsoluteHttpUrl("mailto:x@example.com"), false);
  assert.equal(isAbsoluteHttpUrl("example.com"), false);
  assert.equal(isAbsoluteHttpUrl("/relative/path"), false);
  assert.equal(isAbsoluteHttpUrl("https://"), false);
  assert.equal(isAbsoluteHttpUrl(""), false);
});

test("hasPackageJson reflects the presence of package.json in cwd", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-probe-"));
  try {
    assert.equal(hasPackageJson(dir), false);
    fs.writeFileSync(path.join(dir, "package.json"), "{}");
    assert.equal(hasPackageJson(dir), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("depInstalled detects a package via its node_modules manifest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-probe-"));
  try {
    assert.equal(depInstalled(dir, "pagefind"), false);
    fs.mkdirSync(path.join(dir, "node_modules", "pagefind"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(dir, "node_modules", "pagefind", "package.json"),
      "{}",
    );
    assert.equal(depInstalled(dir, "pagefind"), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("depInstalled finds a dep hoisted to a workspace root (npm/yarn monorepo)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-ws-"));
  const child = path.join(root, "packages", "docs");
  fs.mkdirSync(child, { recursive: true });
  // dep hoisted to the workspace root, not the child's own node_modules
  fs.mkdirSync(path.join(root, "node_modules", "pagefind"), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(root, "node_modules", "pagefind", "package.json"),
    "{}",
  );
  try {
    assert.equal(depInstalled(child, "pagefind"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("readDependencyNames unions all four dependency fields", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-deps-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        dependencies: { a: "1" },
        devDependencies: { b: "1" },
        optionalDependencies: { c: "1" },
        peerDependencies: { d: "1" },
      }),
    );
    assert.deepEqual([...readDependencyNames(dir)].sort(), [
      "a",
      "b",
      "c",
      "d",
    ]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("readDependencyNames returns empty on a missing or corrupt package.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-deps-"));
  try {
    assert.equal(readDependencyNames(dir).size, 0);
    fs.writeFileSync(path.join(dir, "package.json"), "{ not json");
    assert.equal(readDependencyNames(dir).size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// The footprint must come from DECLARED deps (committed package.json), never
// from an installed artifact — so it re-derives correctly on a fresh clone with
// node_modules absent.
test("footprint derives from declared deps with node_modules absent", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-deps-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: { "@cloudflare/nimbus-loader-x": "1" } }),
    );
    const recipe = {
      id: "loader-x",
      requires: "static" as const,
      env: [{ name: "X_TOKEN", kind: "build-time" as const }],
      dep: "@cloudflare/nimbus-loader-x",
    };
    const out = deriveFootprint(readDependencyNames(dir), [recipe]);
    assert.deepEqual(
      out.map((r) => r.id),
      ["loader-x"],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Hard invariant: a build artifact must never influence the build-free footprint.
// A poisoned `.nimbus/features.json` claiming a feature is installed has zero
// effect — presence comes only from declared deps.
test("footprint ignores a poisoned .nimbus/features.json build artifact", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-deps-"));
  try {
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ dependencies: {} }),
    );
    fs.mkdirSync(path.join(dir, ".nimbus"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, ".nimbus", "features.json"),
      JSON.stringify([{ id: "loader-x", dep: "@cloudflare/nimbus-loader-x" }]),
    );
    const recipe = {
      id: "loader-x",
      requires: "static" as const,
      env: [{ name: "X_TOKEN", kind: "build-time" as const }],
      dep: "@cloudflare/nimbus-loader-x",
    };
    assert.deepEqual(deriveFootprint(readDependencyNames(dir), [recipe]), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
