import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { pathToFileURL } from "node:url";

import { build } from "astro";

import nimbus from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

test("bakes prepared artifacts at astro:build:start for prerendered build helpers", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "nimbus-generated-markdown-lifecycle-"),
  );
  roots.push(root);
  await symlink(
    path.resolve(import.meta.dirname, "../node_modules"),
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await mkdir(path.join(root, "src/content/docs"), { recursive: true });
  await mkdir(path.join(root, "src/content/partials"), { recursive: true });
  await mkdir(path.join(root, "src/pages/[...slug]"), { recursive: true });
  await mkdir(path.join(root, "src/pages/[section]"), { recursive: true });
  const contentModule = pathToFileURL(
    path.resolve(import.meta.dirname, "../src/content.ts"),
  ).href;
  const buildModule = pathToFileURL(
    path.resolve(import.meta.dirname, "../src/build.ts"),
  ).href;
  await writeFile(
    path.join(root, "src/content.config.ts"),
    `import { defineCollection } from "astro:content";
import { docsCollection, partialsCollection } from ${JSON.stringify(contentModule)};
export const collections = {
  docs: defineCollection(docsCollection()),
  partials: defineCollection(partialsCollection()),
};`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/content/docs/guide.mdx"),
    '---\ntitle: Guide\n---\n[Guide](/guide)\n\n<ProductName>Cloud</ProductName>\n\n<Render file="shared" />',
    "utf8",
  );
  await mkdir(path.join(root, "src/content/docs/nested"), { recursive: true });
  await writeFile(
    path.join(root, "src/content/docs/nested/index.mdx"),
    "---\ntitle: Nested\n---\nNested",
    "utf8",
  );
  await writeFile(
    path.join(root, "src/content/docs/nested/other.mdx"),
    "---\ntitle: Other\n---\nOther",
    "utf8",
  );
  await writeFile(
    path.join(root, "src/content/partials/resolved-shared.mdx"),
    "## Shared\n\n[Root](/)",
    "utf8",
  );
  await writeFile(
    path.join(root, "src/pages/[...slug]/index.md.ts"),
    `import { getPreparedMarkdownArtifact, getPreparedMarkdownStaticPaths } from ${JSON.stringify(buildModule)};
export const prerender = true;
export const getStaticPaths = () => getPreparedMarkdownStaticPaths({ collection: "docs", surface: "markdown" });
export async function GET({ props }) {
  const artifact = await getPreparedMarkdownArtifact(props.artifact);
  return new Response(artifact.body, { headers: { "content-type": artifact.mediaType } });
}`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/pages/llms.txt.ts"),
    `import { getPreparedLlmsArtifact } from ${JSON.stringify(buildModule)};
export const prerender = true;
export async function GET() {
  const artifact = await getPreparedLlmsArtifact({ scope: "site", surface: "index" });
  return new Response(artifact.body, { headers: { "content-type": artifact.mediaType } });
}`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/pages/llms-full.txt.ts"),
    `import { getPreparedLlmsArtifact } from ${JSON.stringify(buildModule)};
export const prerender = true;
export async function GET() {
  const artifact = await getPreparedLlmsArtifact({ scope: "site", surface: "full" });
  return new Response(artifact.body, { headers: { "content-type": artifact.mediaType } });
}`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/pages/[section]/llms.txt.ts"),
    `import { getPreparedLlmsArtifact, getPreparedLlmsStaticPaths } from ${JSON.stringify(buildModule)};
export const prerender = true;
export const getStaticPaths = () => getPreparedLlmsStaticPaths();
export async function GET({ props }) {
  const artifact = await getPreparedLlmsArtifact(props.artifact);
  return new Response(artifact.body, { headers: { "content-type": artifact.mediaType } });
}`,
    "utf8",
  );

  await build({
    root: pathToFileURL(`${root}${path.sep}`),
    cacheDir: path.join(root, ".astro"),
    outDir: "./dist",
    build: { server: path.join(root, ".server") },
    vite: { cacheDir: path.join(root, ".vite") },
    base: "/docs",
    logLevel: "silent",
    integrations: [
      nimbus(
        {
          site: "https://example.test",
          title: "Test",
          description: "Test",
          search: false,
        },
        {
          admonitions: false,
          sitemap: false,
          validateMdx: false,
          markdown: {
            componentMap: {
              ProductName: {
                revision: "product-name-v1",
                render: ({ children }) => `**${children}**`,
              },
            },
            partialResolver: {
              revision: "partials-v1",
              resolve: ({ file }) => `resolved-${file}`,
            },
          },
        },
      ),
    ],
  });

  const markdown = await readFile(path.join(root, "dist/guide/index.md"), "utf8");
  assert.match(markdown, /\[Guide\]\(\/docs\/guide\)/);
  assert.match(markdown, /\*\*Cloud\*\*/);
  assert.match(markdown, /## Shared/);
  assert.match(markdown, /\[Root\]\(\/docs\/\)/);
  assert.doesNotMatch(markdown, /<Render/);
  assert.match(
    await readFile(path.join(root, "dist/nested/index.md"), "utf8"),
    /# Nested/,
  );
  assert.match(
    await readFile(path.join(root, "dist/llms.txt"), "utf8"),
    /\[Guide\]\(https:\/\/example\.test\/docs\/guide\/index\.md\)/,
  );
  assert.match(
    await readFile(path.join(root, "dist/nested/llms.txt"), "utf8"),
    /Nested/,
  );
  const llmsFull = await readFile(path.join(root, "dist/llms-full.txt"), "utf8");
  assert.match(llmsFull, /# Guide/);
  assert.match(llmsFull, /## Shared/);
  assert.match(llmsFull, /\[Root\]\(\/docs\/\)/);
  assert.doesNotMatch(llmsFull, /<Render/);
  assert.match(
    await readFile(
      path.join(root, ".astro/nimbus/prepared-artifacts/manifest.json"),
      "utf8",
    ),
    /"audience": "public"/,
  );
  assert.match(
    await readFile(
      path.join(root, ".astro/nimbus/prepared-artifacts/manifest.json"),
      "utf8",
    ),
    /"slug": "shared"/,
  );
});

test("does not bake for unrelated Markdown endpoints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nimbus-unrelated-markdown-route-"));
  roots.push(root);
  await symlink(
    path.resolve(import.meta.dirname, "../node_modules"),
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await mkdir(path.join(root, "src/pages/unrelated"), { recursive: true });
  await writeFile(
    path.join(root, "src/content.config.ts"),
    `import { defineCollection } from "astro:content";
const loader = {
  name: "unprepared",
  load({ store }) {
    store.set({ id: "guide", body: "Guide", data: { title: "Guide" } });
  },
};
export const collections = { docs: defineCollection({ loader }) };`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src/pages/unrelated/index.md.ts"),
    'export const prerender = true;\nexport const GET = () => new Response("Unrelated");',
    "utf8",
  );

  await build({
    root: pathToFileURL(`${root}${path.sep}`),
    cacheDir: path.join(root, ".astro"),
    outDir: "./dist",
    build: { server: path.join(root, ".server") },
    vite: { cacheDir: path.join(root, ".vite") },
    logLevel: "silent",
    integrations: [
      nimbus(
        { site: "https://example.test", title: "Test", search: false },
        { admonitions: false, sitemap: false, validateMdx: false },
      ),
    ],
  });

  assert.equal(
    await readFile(path.join(root, "dist/unrelated/index.md"), "utf8"),
    "Unrelated",
  );
});
