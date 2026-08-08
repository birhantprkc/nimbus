/**
 * Regression lock for the version-alternates ↔ gating wiring. Drives the real
 * `astro:config:setup` hook with a versioned + gated fixture and asserts no
 * gated slug reaches Astro's `redirects` config. Without the projection filter
 * in the hook, a gated current-version page absent from an older version emits
 * a `/v<old>/<gated>` redirect — the leak the filter closes.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import nimbus from "../src/index.js";

const dirUrl = (p: string) => pathToFileURL(p + path.sep);

const doc = (title: string) => `---\ntitle: ${title}\ndescription: D\n---\n\nBody.\n`;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-vgate-"));
  const write = async (rel: string, body: string) => {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body, "utf8");
  };
  await write("src/content/docs/guide.mdx", doc("Guide"));
  await write("src/content/docs/newpage.mdx", doc("New"));
  await write("src/content/docs/secret/plan.mdx", doc("Secret"));
  await write("src/content/docs-v1/guide.mdx", doc("Guide v1"));
  return root;
}

async function runSetup(root: string, gated: string[]) {
  const logger = {
    warn: () => {},
    info: () => {},
    error: () => {},
    debug: () => {},
    fork() {
      return logger;
    },
  };
  let updated: Record<string, unknown> | null = null;
  const integration = nimbus(
    {
      site: "https://example.test",
      title: "T",
      description: "D",
      locale: "en",
      versions: { current: "v2", others: ["v1"] },
      gated,
    } as never,
    {
      validateMdx: false,
      admonitions: false,
      sitemap: false,
      markdown: { processor: {} as never },
    },
  );
  const hook = integration.hooks["astro:config:setup"];
  assert.ok(hook);
  await hook!({
    updateConfig: (config: Record<string, unknown>) => {
      updated = { ...(updated ?? {}), ...config };
      return {} as never;
    },
    config: {
      root: dirUrl(root),
      srcDir: dirUrl(path.join(root, "src")),
      cacheDir: dirUrl(path.join(root, ".cache")),
      base: "",
    },
    logger,
  } as never);
  return (updated?.redirects ?? {}) as Record<string, string>;
}

test("gated page absent in an old version emits no cross-version redirect", async () => {
  const root = await fixture();
  const redirects = await runSetup(root, ["secret/**"]);
  const froms = Object.keys(redirects);
  assert.ok(
    froms.includes("/v1/newpage/"),
    `machinery ran: public missing page redirects. got: ${JSON.stringify(froms)}`,
  );
  assert.deepEqual(
    froms.filter((f) => f.includes("secret")),
    [],
    "no gated slug may appear in Astro redirects",
  );
});

test("negative control: without gating, the secret page DOES emit a redirect", async () => {
  const root = await fixture();
  const redirects = await runSetup(root, []);
  assert.ok(
    Object.keys(redirects).includes("/v1/secret/plan/"),
    "sanity: the leak exists when nothing is gated, proving the guard is load-bearing",
  );
});
