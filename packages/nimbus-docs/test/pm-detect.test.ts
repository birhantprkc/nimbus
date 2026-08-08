import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { detectPackageManager, quoteForDisplay } from "../src/cli/pm.js";

function withTree(fn: (root: string) => void): void {
  const root = mkdtempSync(join(tmpdir(), "nb-pm-"));
  try {
    fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// The ancestor walk is a last-ditch AFTER the user-agent check, so unset it to
// exercise the walk deterministically regardless of the PM running the suite.
function withoutUserAgent(fn: () => void): void {
  const saved = process.env.npm_config_user_agent;
  delete process.env.npm_config_user_agent;
  try {
    fn();
  } finally {
    if (saved !== undefined) process.env.npm_config_user_agent = saved;
  }
}

test("detects a workspace-root lockfile from a nested package dir", () => {
  withoutUserAgent(() => {
    withTree((root) => {
      writeFileSync(join(root, "pnpm-lock.yaml"), "");
      const sub = join(root, "packages", "docs");
      mkdirSync(sub, { recursive: true });
      assert.equal(detectPackageManager(sub), "pnpm");
    });
  });
});

test("user-agent outranks a distant ancestor lockfile (no cwd lockfile)", () => {
  withTree((root) => {
    writeFileSync(join(root, "package-lock.json"), "");
    const sub = join(root, "scratch");
    mkdirSync(sub, { recursive: true });
    const saved = process.env.npm_config_user_agent;
    process.env.npm_config_user_agent = "pnpm/9.0.0 npm/? node/v24";
    try {
      assert.equal(detectPackageManager(sub), "pnpm");
    } finally {
      if (saved === undefined) delete process.env.npm_config_user_agent;
      else process.env.npm_config_user_agent = saved;
    }
  });
});

test("nearest lockfile wins over an ancestor's", () => {
  withTree((root) => {
    writeFileSync(join(root, "pnpm-lock.yaml"), "");
    const sub = join(root, "app");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "yarn.lock"), "");
    assert.equal(detectPackageManager(sub), "yarn");
  });
});

test("quoteForDisplay leaves a clean spec unchanged, quotes shell-unsafe ones", () => {
  assert.equal(quoteForDisplay("@astrojs/vercel@^11"), "@astrojs/vercel@^11");
  assert.equal(quoteForDisplay("@astrojs/node@^11"), "@astrojs/node@^11");
  assert.equal(
    quoteForDisplay("@astrojs/cloudflare@>=14.1.0 <14.2.0"),
    "'@astrojs/cloudflare@>=14.1.0 <14.2.0'",
  );
  assert.equal(quoteForDisplay("a'b"), "'a'\\''b'");
  // Injection metacharacters are always quoted.
  for (const unsafe of ["a;rm -rf /", "a`b`", "a$(x)", "a|b", "a&b"]) {
    assert.equal(quoteForDisplay(unsafe).startsWith("'"), true, unsafe);
  }
});
