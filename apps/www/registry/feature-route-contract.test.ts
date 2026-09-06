import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const FEATURES = join(dirname(fileURLToPath(import.meta.url)), "features");

async function feature(name: string): Promise<string> {
  return readFile(join(FEATURES, `${name}.md`), "utf8");
}

test("collection recipes canonicalize nested index routes", async () => {
  for (const name of ["new-collection", "new-version", "changelog"]) {
    const source = await feature(name);
    assert.match(source, /entryRouteKey/);
    assert.doesNotMatch(source, /withBaseRoute/);
    assert.doesNotMatch(source, /\$\{entry\.id\}\/index\.md/);
  }
});

test("collection recipes resolve breadcrumbs from their own collection", async () => {
  for (const name of ["new-collection", "new-version"]) {
    const source = await feature(name);
    assert.match(source, /getBreadcrumbs\(currentSlug, \{ collection: entry\.collection \}\)/);
    assert.match(source, /stripBase\(Astro\.url\.pathname, import\.meta\.env\.BASE_URL\)/);
  }
});

test("changelog serves and links its expanded source artifact", async () => {
  const source = await feature("changelog");
  assert.match(source, /surface: "source"/);
  assert.match(source, /sourcePath[\s\S]*index\.mdx/);
  assert.match(source, /Source:.*absoluteUrl\(sourcePath\)/);
});

test("changelog reserves its index entry for the feed route", async () => {
  const source = await feature("changelog");
  assert.match(
    source,
    /### 5h\.[\s\S]*?```astro\n---\nimport type \{ GetStaticPaths \} from "astro";/,
  );
  assert.match(source, /getChangelogStaticPaths[\s\S]*filter\(\(path\) => path\.params\.slug\)/);
  assert.equal(
    source.match(/paths\.filter\(\(path\) => path\.params\.slug !== undefined\)/g)?.length,
    2,
  );
});

test("feature recipes base dynamic terminal links", async () => {
  const changelog = await feature("changelog");
  assert.doesNotMatch(changelog, /href="\/changelog/);
  assert.match(changelog, /new URL\(withBase\("\/changelog\/rss\.xml"/);
  assert.match(changelog, /withBase\(`\/changelog\/\$\{entry\.id\}\/`/);

  assert.match(
    await feature("404-page"),
    /const homeHref = withBase\("\/", import\.meta\.env\.BASE_URL\)/,
  );
  assert.match(
    await feature("component-showcase"),
    /### `src\/pages\/components\.astro`[\s\S]*import \{ getSidebar, withBase \}[\s\S]*href=\{withBase\(`\/components\/\$\{entry\.id\}`/,
  );
});
