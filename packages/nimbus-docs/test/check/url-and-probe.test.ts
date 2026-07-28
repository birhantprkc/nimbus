import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { isAbsoluteHttpUrl } from "../../src/_internal/validate.js";
import { depInstalled, hasPackageJson } from "../../src/check/probe.js";

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
    fs.mkdirSync(path.join(dir, "node_modules", "pagefind"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "pagefind", "package.json"), "{}");
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
  fs.mkdirSync(path.join(root, "node_modules", "pagefind"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "pagefind", "package.json"), "{}");
  try {
    assert.equal(depInstalled(child, "pagefind"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
