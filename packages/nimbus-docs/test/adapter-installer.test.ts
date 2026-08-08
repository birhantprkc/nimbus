import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  installAdapter,
  type DepInstaller,
} from "../src/cli/adapter.js";

const STARTER_CONFIG = `import { defineConfig } from "astro/config";
import nimbus from "@cloudflare/nimbus-docs";

export default defineConfig({
  // nimbus:adapter
  output: "static",
  integrations: [nimbus()],
});
`;

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "nimbus-adapter-"));
}

/** Records what deps were requested; always succeeds. */
function recordingInstaller(): { installer: DepInstaller; calls: string[][] } {
  const calls: string[][] = [];
  const installer: DepInstaller = async (deps) => {
    calls.push(deps);
    return { ok: true };
  };
  return { installer, calls };
}

function project(dir: string, opts: { config?: string; astroDep?: boolean } = {}): void {
  const { config = STARTER_CONFIG, astroDep = true } = opts;
  writeFileSync(join(dir, "astro.config.ts"), config);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "docs",
      dependencies: astroDep ? { astro: "^7.0.0" } : {},
    }),
  );
}

test("applies the adapter: flips config, installs deps, records provenance", async () => {
  const dir = scratch();
  project(dir);
  writeFileSync(join(dir, "nimbus.json"), JSON.stringify({ version: "0.9.0" }));
  const { installer, calls } = recordingInstaller();

  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "applied");
  if (res.status !== "applied") return;

  const written = readFileSync(join(dir, "astro.config.ts"), "utf8");
  assert.match(written, /output:\s*"server"/);
  assert.match(written, /adapter: vercel\(\),/);
  assert.match(written, /import vercel from "@astrojs\/vercel";/);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], ["@astrojs/vercel@^11"]);

  const nimbus = JSON.parse(readFileSync(join(dir, "nimbus.json"), "utf8"));
  assert.deepEqual(nimbus.serverOutput, { adapter: "vercel" });
});

test("netlify pulls @netlify/blobs alongside the adapter", async () => {
  const dir = scratch();
  project(dir);
  const { installer, calls } = recordingInstaller();
  const res = await installAdapter("netlify", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "applied");
  assert.deepEqual(calls[0], ["@astrojs/netlify@^8", "@netlify/blobs@^9"]);
});

test("is idempotent: second run is a no-op, no duplicate edits", async () => {
  const dir = scratch();
  project(dir);
  const { installer } = recordingInstaller();

  const first = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(first.status, "applied");
  const afterFirst = readFileSync(join(dir, "astro.config.ts"), "utf8");

  const second = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(second.status, "noop");
  const afterSecond = readFileSync(join(dir, "astro.config.ts"), "utf8");
  assert.equal(afterSecond, afterFirst, "config unchanged on re-run");
  assert.equal((afterSecond.match(/adapter:/g) ?? []).length, 1);
});

test("records provenance on the noop path too (M3)", async () => {
  const dir = scratch();
  project(dir);
  const { installer } = recordingInstaller();
  // First run applies and records.
  await installAdapter("vercel", { cwd: dir, installDeps: installer });
  // Simulate a nimbus.json that appeared only after the first run (or a
  // hand-wired config): clear provenance, then re-run → noop must re-record.
  writeFileSync(join(dir, "nimbus.json"), JSON.stringify({ version: "0.9.0" }));
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "noop");
  const nimbus = JSON.parse(readFileSync(join(dir, "nimbus.json"), "utf8"));
  assert.deepEqual(nimbus.serverOutput, { adapter: "vercel" });
});

test("refuses to swap a different adapter", async () => {
  const dir = scratch();
  project(dir);
  const { installer } = recordingInstaller();
  await installAdapter("vercel", { cwd: dir, installDeps: installer });
  const res = await installAdapter("node", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "existing-adapter");
});

test("errors in a non-Astro directory (no config)", async () => {
  const dir = scratch();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x" }));
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "non-astro-project");
});

test("errors at a monorepo root (workspaces, no config)", async () => {
  const dir = scratch();
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "root", workspaces: ["packages/*"] }),
  );
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "monorepo-root");
});

test("errors at a pnpm-workspace root", async () => {
  const dir = scratch();
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "root" }));
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - packages/*\n");
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "monorepo-root");
});

test("errors when a config exists but astro isn't a dependency", async () => {
  const dir = scratch();
  project(dir, { astroDep: false });
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "non-astro-project");
});

test("errors on a missing marker without writing", async () => {
  const dir = scratch();
  project(dir, { config: STARTER_CONFIG.replace("  // nimbus:adapter\n", "") });
  const before = readFileSync(join(dir, "astro.config.ts"), "utf8");
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "missing-marker");
  assert.equal(readFileSync(join(dir, "astro.config.ts"), "utf8"), before);
});

test("warns about a pre-existing vercel.json but still applies", async () => {
  const dir = scratch();
  project(dir);
  writeFileSync(join(dir, "vercel.json"), "{}");
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "applied");
  if (res.status !== "applied") return;
  assert.ok(res.warnings.some((w) => /vercel\.json/.test(w)));
});

test("warns about a pre-existing public/_redirects", async () => {
  const dir = scratch();
  project(dir);
  mkdirSync(join(dir, "public"));
  writeFileSync(join(dir, "public", "_redirects"), "/old /new 301\n");
  const { installer } = recordingInstaller();
  const res = await installAdapter("cloudflare", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "applied");
  if (res.status !== "applied") return;
  assert.ok(res.warnings.some((w) => /_redirects/.test(w)));
});

test("dep-install failure leaves the config untouched (deps-first, no half state)", async () => {
  const dir = scratch();
  project(dir);
  writeFileSync(join(dir, "nimbus.json"), JSON.stringify({ version: "0.9.0" }));
  const before = readFileSync(join(dir, "astro.config.ts"), "utf8");
  const failing: DepInstaller = async () => ({ ok: false, message: "boom" });
  const res = await installAdapter("vercel", { cwd: dir, installDeps: failing });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "deps-failed");
  // Deps run first: on failure the config must still be byte-identical static,
  // and provenance must not be recorded.
  assert.equal(readFileSync(join(dir, "astro.config.ts"), "utf8"), before);
  const nimbus = JSON.parse(readFileSync(join(dir, "nimbus.json"), "utf8"));
  assert.equal(nimbus.serverOutput, undefined);
});

test("skips installing deps already present", async () => {
  const dir = scratch();
  writeFileSync(join(dir, "astro.config.ts"), STARTER_CONFIG);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "docs",
      dependencies: { astro: "^7.0.0", "@astrojs/vercel": "^11" },
    }),
  );
  const { installer, calls } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "applied");
  assert.equal(calls.length, 0, "no install call when dep already present");
});

test("rejects an already-installed incompatible cloudflare adapter range", async () => {
  const dir = scratch();
  writeFileSync(join(dir, "astro.config.ts"), STARTER_CONFIG);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "docs",
      dependencies: { astro: "^7.0.0", "@astrojs/cloudflare": "^14.2.0" },
    }),
  );
  const before = readFileSync(join(dir, "astro.config.ts"), "utf8");
  const { installer, calls } = recordingInstaller();
  const res = await installAdapter("cloudflare", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "deps-failed");
  assert.match(res.message, /requires @astrojs\/cloudflare@>=14\.1\.0 <14\.2\.0/);
  assert.equal(calls.length, 0);
  assert.equal(readFileSync(join(dir, "astro.config.ts"), "utf8"), before);
});

test("malformed nimbus.json does not fail after a successful config write", async () => {
  const dir = scratch();
  project(dir);
  writeFileSync(join(dir, "nimbus.json"), "{ nope");
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "applied");
  assert.match(readFileSync(join(dir, "astro.config.ts"), "utf8"), /output:\s*"server"/);
});

test("refuses a .cjs config rather than writing an ESM import into it", async () => {
  const dir = scratch();
  const cjs = `const { defineConfig } = require("astro/config");
module.exports = defineConfig({
  // nimbus:adapter
  output: "static",
});
`;
  writeFileSync(join(dir, "astro.config.cjs"), cjs);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "docs", dependencies: { astro: "^7.0.0" } }),
  );
  const { installer, calls } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "cjs-config");
  assert.equal(calls.length, 0);
  assert.equal(readFileSync(join(dir, "astro.config.cjs"), "utf8"), cjs);
});

test("refuses a CommonJS-by-content .js config", async () => {
  const dir = scratch();
  const cjs = `const { defineConfig } = require("astro/config");
module.exports = defineConfig({
  // nimbus:adapter
  output: "static",
});
`;
  writeFileSync(join(dir, "astro.config.js"), cjs);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "docs", dependencies: { astro: "^7.0.0" } }),
  );
  const { installer } = recordingInstaller();
  const res = await installAdapter("vercel", { cwd: dir, installDeps: installer });
  assert.equal(res.status, "error");
  if (res.status !== "error") return;
  assert.equal(res.code, "cjs-config");
});
