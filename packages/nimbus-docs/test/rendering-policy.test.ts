import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test, type TestContext } from "node:test";

import nimbus from "../src/index.js";
import { appendRequestSitemapPages } from "../src/integration.js";
import {
  canonicalCollectionRouteComponent,
  compileRenderingPolicy,
  normalizeRouteComponent,
  routeComponentKeys,
} from "../src/_internal/rendering-policy.js";
import { getCodeStyleCSS } from "../src/_internal/code-style-registry.js";
import { parseContentCollections } from "../src/_internal/parse-content-collections.js";
import {
  requestInventoryEntryUrl,
  requestInventoryVersionStatusKey,
} from "../src/_internal/request-route-url.js";
import { validateNimbusConfig } from "../src/_internal/validate.js";
import type { NimbusConfig, RenderingConfig } from "../src/types.js";

const baseConfig = (rendering?: RenderingConfig): NimbusConfig => ({
  site: "https://example.test",
  title: "Docs",
  search: false,
  ...(rendering ? { rendering } : {}),
});

test("request inventory preserves prose ids and only collapses the API root", () => {
  assert.equal(requestInventoryEntryUrl("", "index", false), "/index");
  assert.equal(
    requestInventoryEntryUrl("", "guides/index", false),
    "/guides/index",
  );
  assert.equal(requestInventoryEntryUrl("/blog", "index", false), "/blog/index");
  assert.equal(requestInventoryEntryUrl("/api", "index", true), "/api");
  assert.equal(
    requestInventoryEntryUrl("/api", "guides/index", true),
    "/api/guides/index",
  );
  assert.equal(requestInventoryVersionStatusKey("docs-v1", false, "v1"), "docs-v1");
  assert.equal(requestInventoryVersionStatusKey("api", true, "v1"), "api@v1");
});

test("request sitemap finalizer preserves namespaces and serialized fields", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-request-sitemap-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const sitemap = path.join(root, "sitemap-0.xml");
  await writeFile(
    sitemap,
    '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>https://example.test/</loc></url></urlset>',
    "utf8",
  );

  await appendRequestSitemapPages(
    pathToFileURL(`${root}${path.sep}`),
    ["https://example.test/runtime/", "https://example.test/runtime/"],
    ({ url }) => ({
      url,
      changefreq: "daily",
      priority: 0.7,
      links: [{ lang: "fr", url: "https://example.test/fr/runtime/?a=1&b=2" }],
    }),
  );

  const xml = await readFile(sitemap, "utf8");
  assert.equal(xml.match(/xmlns:xhtml=/g)?.length, 1);
  assert.equal(xml.match(/<loc>https:\/\/example\.test\/runtime\/<\/loc>/g)?.length, 1);
  assert.match(xml, /<changefreq>daily<\/changefreq>/);
  assert.match(xml, /<priority>0\.7<\/priority>/);
  assert.match(xml, /href="https:\/\/example\.test\/fr\/runtime\/\?a=1&amp;b=2"/);
});

test("rendering config is optional and validates only build/request modes", () => {
  assert.equal(validateNimbusConfig(baseConfig()).rendering, undefined);
  assert.deepEqual(
    validateNimbusConfig(
      baseConfig({ default: "request", collections: { docs: "build" } }),
    ).rendering,
    { default: "request", collections: { docs: "build" } },
  );

  assert.throws(
    () => validateNimbusConfig(baseConfig({ default: "invalid" as never })),
    /rendering\.default: rendering mode must be either "build" or "request"/,
  );
  assert.throws(
    () =>
      validateNimbusConfig(
        baseConfig({ collections: { docs: "invalid" as never } }),
      ),
    /rendering\.collections\.docs: rendering mode must be either "build" or "request"/,
  );
  assert.throws(
    () =>
      validateNimbusConfig({
        ...baseConfig(),
        rendering: { default: "build", paths: {} },
      }),
    /Unknown rendering sub-key "paths"/,
  );
});

test("compiled policy applies the build default and collection overrides", () => {
  assert.deepEqual(compileRenderingPolicy(undefined, ["docs", "api"]), {
    default: "build",
    collections: { docs: "build", api: "build" },
  });
  assert.deepEqual(
    compileRenderingPolicy(
      { default: "request", collections: { docs: "build" } },
      ["docs", "api"],
    ),
    {
      default: "request",
      collections: { docs: "build", api: "request" },
    },
  );
});

test("compiled policy rejects overrides without canonical collection routes", () => {
  assert.throws(
    () =>
      compileRenderingPolicy({ collections: { typo: "request" } }, ["docs"]),
    /without a registered canonical catch-all route:[\s\S]*"typo"/,
  );
});

test("canonical route keys respect collection mounts and custom srcDir", () => {
  const root = path.join(path.sep, "workspace");
  const srcDir = path.join(root, "app");
  const versions = { others: ["v1"] };

  assert.equal(
    canonicalCollectionRouteComponent(srcDir, "docs", versions),
    path.join(srcDir, "pages", "[...slug].astro"),
  );
  assert.equal(
    canonicalCollectionRouteComponent(srcDir, "docs-v1", versions),
    path.join(srcDir, "pages", "v1", "[...slug].astro"),
  );
  assert.equal(
    canonicalCollectionRouteComponent(srcDir, "api", versions),
    path.join(srcDir, "pages", "api", "[...slug].astro"),
  );
  assert.deepEqual(
    routeComponentKeys(
      root,
      path.join(srcDir, "pages", "api", "[...slug].astro"),
    ),
    [
      normalizeRouteComponent(
        path.join(srcDir, "pages", "api", "[...slug].astro"),
      ),
      "app/pages/api/[...slug].astro",
    ],
  );
});

async function setupIntegration(
  t: TestContext,
  rendering?: RenderingConfig,
  command: "dev" | "build" = "dev",
  contentConfig = 'export const collections = { docs: {}, blog: {}, "docs-v1": {} };\n',
  api?: NimbusConfig["api"],
) {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-rendering-policy-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const write = async (relative: string, body: string) => {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body, "utf8");
  };
  await write("src/content.config.ts", contentConfig);
  await write("src/components.ts", "export const components = {};\n");
  await write("src/pages/[...slug].astro", "---\n---\n");
  await write("src/pages/blog/[...slug].astro", "---\n---\n");
  await write("src/pages/v1/[...slug].astro", "---\n---\n");
  await write("src/pages/api/[...slug].astro", "---\n---\n");
  await write(
    "src/content/docs/index.mdx",
    "# Docs\n\n```js\nconst requestRendered = true;\n```\n",
  );

  const integration = nimbus(
    {
      ...baseConfig(rendering),
      versions: { current: "v2", others: ["v1"] },
      ...(api ? { api } : {}),
    },
    {
      validateMdx: false,
      admonitions: false,
      sitemap: false,
      markdown: { processor: {} as never },
    },
  );
  const setup = integration.hooks["astro:config:setup"];
  assert.ok(setup);
  const configUpdates: Array<Record<string, unknown>> = [];
  const injectedRoutes: unknown[] = [];
  await setup!({
    updateConfig: (update: Record<string, unknown>) => {
      configUpdates.push(update);
      return {} as never;
    },
    injectRoute: (route: unknown) => injectedRoutes.push(route),
    config: {
      root: pathToFileURL(`${root}${path.sep}`),
      srcDir: pathToFileURL(`${path.join(root, "src")}${path.sep}`),
      cacheDir: pathToFileURL(`${path.join(root, ".cache")}${path.sep}`),
      base: "",
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      fork() {
        return this;
      },
    },
    command,
  } as never);

  const routeSetup = integration.hooks["astro:route:setup"];
  const configDone = integration.hooks["astro:config:done"];
  const routesResolved = integration.hooks["astro:routes:resolved"];
  const serverSetup = integration.hooks["astro:server:setup"];
  const buildStart = integration.hooks["astro:build:start"];
  const buildDone = integration.hooks["astro:build:done"];
  assert.ok(routeSetup);
  assert.ok(configDone);
  assert.ok(routesResolved);
  assert.ok(serverSetup);
  assert.ok(buildStart);
  assert.ok(buildDone);
  return {
    root,
    configUpdates,
    injectedRoutes,
    routeSetup: routeSetup!,
    configDone: configDone!,
    routesResolved: routesResolved!,
    serverSetup: serverSetup!,
    buildStart: buildStart!,
    buildDone: buildDone!,
  };
}

test("route policy independently selects canonical collection catch-alls", async (t) => {
  const { routeSetup } = await setupIntegration(t, {
    default: "request",
    collections: { docs: "build" },
  });
  const docs = { component: "src/pages/[...slug].astro", prerender: false };
  const blog = { component: "src/pages/blog/[...slug].astro", prerender: true };
  const version = {
    component: "src/pages/v1/[...slug].astro",
    prerender: true,
  };
  const nearMatch = {
    component: "src/pages/blog/[...path].astro",
    prerender: true,
  };

  await routeSetup({ route: docs } as never);
  await routeSetup({ route: blog } as never);
  await routeSetup({ route: version } as never);
  await routeSetup({ route: nearMatch } as never);

  assert.equal(docs.prerender, true);
  assert.equal(blog.prerender, false);
  assert.equal(version.prerender, false);
  assert.equal(nearMatch.prerender, true);
});

test("omitted rendering policy leaves existing route decisions untouched", async (t) => {
  const integration = await setupIntegration(t, undefined, "build");
  const docs = { component: "src/pages/[...slug].astro", prerender: false };
  const blog = { component: "src/pages/blog/[...slug].astro", prerender: true };

  await integration.routeSetup({ route: docs } as never);
  await integration.routeSetup({ route: blog } as never);

  assert.equal(docs.prerender, false);
  assert.equal(blog.prerender, true);
  assert.equal(integration.injectedRoutes.length, 0);

  integration.configDone({
    injectTypes: () => new URL("file:///noop"),
    config: { output: "static" },
    buildOutput: "static",
  } as never);
  integration.routesResolved({ routes: [] } as never);
  await integration.buildDone({
    dir: pathToFileURL(`${path.join(integration.root, "dist")}${path.sep}`),
    pages: [{ pathname: "/_nimbus/request-route-inventory.json" }],
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
      fork() {
        return this;
      },
    },
  } as never);
  const routeTruth = JSON.parse(
    await readFile(path.join(integration.root, ".nimbus/routes.json"), "utf8"),
  );
  assert.deepEqual(routeTruth.knownRoutes, [
    "/_nimbus/request-route-inventory.json",
  ]);
});

test("opaque version registrations still reach the request inventory", async (t) => {
  const integration = await setupIntegration(
    t,
    { collections: { "docs-v1": "request" } },
    "build",
    "const collections = makeCollections(); export { collections };\n",
  );
  const plugins = integration.configUpdates.flatMap(
    (update) =>
      (update.vite as { plugins?: unknown[] } | undefined)?.plugins ?? [],
  ) as Array<{
    name?: string;
    resolveId?(id: string): string | undefined;
    load?(id: string): string | undefined;
  }>;
  const virtualConfig = plugins.find(
    (plugin) => plugin.name === "nimbus-docs:virtual-config",
  );
  assert.ok(virtualConfig?.resolveId && virtualConfig.load);
  const resolved = virtualConfig.resolveId("virtual:nimbus/config");
  assert.ok(resolved);
  assert.match(
    virtualConfig.load(resolved) ?? "",
    /requestRenderingCollections = \["docs-v1"\]/,
  );
  assert.match(
    virtualConfig.load(resolved) ?? "",
    /indexedCollections = \["docs","docs-v1"\]/,
  );
});

test("an explicitly empty rendering policy applies the build default", async (t) => {
  const { routeSetup } = await setupIntegration(t, {});
  const docs = { component: "src/pages/[...slug].astro", prerender: false };
  const blog = {
    component: "src/pages/blog/[...slug].astro",
    prerender: false,
  };

  await routeSetup({ route: docs } as never);
  await routeSetup({ route: blog } as never);

  assert.equal(docs.prerender, true);
  assert.equal(blog.prerender, true);
});

test("production request rendering requires server output and an adapter", async (t) => {
  const staticBuild = await setupIntegration(
    t,
    { collections: { docs: "request" } },
    "build",
  );
  assert.throws(
    () =>
      staticBuild.configDone({
        injectTypes: () => new URL("file:///noop"),
        config: { output: "static", adapter: null },
        buildOutput: "static",
      } as never),
    /requires Astro `output: "server"` and a compatible adapter.*output=static, adapter=none/,
  );

  const adapterlessBuild = await setupIntegration(
    t,
    { collections: { docs: "request" } },
    "build",
  );
  assert.throws(
    () =>
      adapterlessBuild.configDone({
        injectTypes: () => new URL("file:///noop"),
        config: { output: "server", adapter: null },
        buildOutput: "server",
      } as never),
    /output=server, adapter=none/,
  );

  const serverBuild = await setupIntegration(
    t,
    { collections: { docs: "request" } },
    "build",
  );
  assert.doesNotThrow(() =>
    serverBuild.configDone({
      injectTypes: () => new URL("file:///noop"),
      config: { output: "server", adapter: { name: "cloudflare" } },
      buildOutput: "server",
    } as never),
  );

  assert.throws(
    () =>
      serverBuild.configDone({
        injectTypes: () => new URL("file:///noop"),
        config: { output: "server", adapter: { name: "node" } },
        buildOutput: "server",
      } as never),
    /currently requires `@astrojs\/cloudflare`/,
  );
});

test("production API request rendering is accepted with model packaging", async (t) => {
  const integration = await setupIntegration(
    t,
    { collections: { api: "request" } },
    "build",
    'export const collections = { docs: {}, "docs-v1": {}, api: {} };\n',
    [
      {
        collection: "api",
        spec: {
          openapi: "3.1.0",
          info: { title: "API", version: "1" },
          paths: {
            "/ping": {
              get: {
                operationId: "ping",
                responses: { "200": { description: "OK" } },
              },
            },
          },
        },
      },
    ],
  );
  assert.doesNotThrow(() =>
    integration.configDone({
      injectTypes: () => new URL("file:///noop"),
      config: { output: "server", adapter: { name: "cloudflare" } },
      buildOutput: "server",
    } as never),
  );
});

test("configured request routes are explained to the build invariant", async (t) => {
  const integration = await setupIntegration(
    t,
    { collections: { docs: "request" } },
    "build",
  );
  const route = {
    component: "src/pages/[...slug].astro",
    prerender: true,
  };
  await integration.routeSetup({ route } as never);
  integration.configDone({
    injectTypes: () => new URL("file:///noop"),
    config: { output: "server", adapter: { name: "cloudflare" } },
    buildOutput: "server",
  } as never);
  integration.routesResolved({
    routes: [
      {
        pattern: "/[...slug]",
        entrypoint: "src/pages/[...slug].astro",
        type: "page",
        isPrerendered: false,
        origin: "project",
      },
    ],
  } as never);
  await integration.buildStart({} as never);

  const dist = path.join(integration.root, "dist");
  await mkdir(path.join(dist, "_nimbus"), { recursive: true });
  await writeFile(
    path.join(dist, "_nimbus/request-route-inventory.json"),
    JSON.stringify([
      { collection: "docs", url: "/guide/" },
      { collection: "docs", url: "/built/" },
      { collection: "blog", url: "/blog/post/" },
    ]),
    "utf8",
  );
  const infos: string[] = [];
  await assert.doesNotReject(() =>
    integration.buildDone({
      dir: pathToFileURL(`${dist}${path.sep}`),
      pages: [
        { pathname: "/built" },
        { pathname: "/foo/_nimbus/request-route-inventory.json" },
        { pathname: "/_nimbus/request-route-inventory.json" },
      ],
      logger: {
        info: (message: string) => infos.push(message),
        warn: () => {},
        error: () => {},
        debug: () => {},
        fork() {
          return this;
        },
      },
    } as never),
  );
  assert.equal(route.prerender, false);
  assert.ok(
    infos.some((message) => /docs prerendered=2\/3 \(1 moved\)/.test(message)),
  );
  assert.deepEqual(
    JSON.parse(
      await readFile(
        path.join(integration.root, ".nimbus/routes.json"),
        "utf8",
      ),
    ),
    {
      version: 1,
      base: "",
      knownRoutes: [
        "/built",
        "/foo/_nimbus/request-route-inventory.json",
        "/guide",
      ],
      opaqueNamespaces: [],
    },
  );
  assert.equal(
    integration.injectedRoutes.some(
      (candidate) =>
        (candidate as { pattern?: string }).pattern ===
        "/_nimbus/request-route-inventory.json",
    ),
    true,
  );
  await assert.rejects(() =>
    readFile(path.join(dist, "_nimbus/request-route-inventory.json"), "utf8"),
  );
  assert.match(
    await readFile(path.join(dist, "_nimbus/shiki.css"), "utf8"),
    /\.nb-shiki-/,
  );
});

test("dev setup preserves pre-registered request styles", async (t) => {
  const integration = await setupIntegration(t, {
    collections: { docs: "request" },
  });
  assert.match(getCodeStyleCSS(), /\.nb-shiki-/);
  await integration.serverSetup({
    server: {
      middlewares: { use: () => {} },
      watcher: { on: () => {} },
      config: { logger: { error: () => {} } },
    },
  } as never);
  assert.match(getCodeStyleCSS(), /\.nb-shiki-/);
});

test("collection parsing reports whether registrations are complete", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-collection-parse-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, "content.config.ts");

  await writeFile(file, "export const collections = { docs: {}, blog: {} };\n");
  assert.deepEqual(await parseContentCollections(file), {
    names: ["docs", "blog"],
    complete: true,
  });

  await writeFile(
    file,
    "export const collections = { docs: {}, ...extras, [name]: value };\n",
  );
  assert.deepEqual(await parseContentCollections(file), {
    names: ["docs"],
    complete: false,
  });

  await writeFile(file, "const all = {}; export { all as collections };\n");
  assert.deepEqual(await parseContentCollections(file), {
    names: [],
    complete: false,
  });

  await writeFile(
    file,
    "export const collections = { docs: {} }; collections.blog = {};\n",
  );
  assert.deepEqual(await parseContentCollections(file), {
    names: ["docs"],
    complete: false,
  });

  await writeFile(
    file,
    "export const collections = { docs: {} }; type Name = keyof typeof collections;\n",
  );
  assert.deepEqual(await parseContentCollections(file), {
    names: ["docs"],
    complete: true,
  });
});

test("opaque registrations cannot silently absorb request policy", async (t) => {
  const contentConfig =
    'const extras = {}; export const collections = { docs: {}, "docs-v1": {}, ...extras };\n';
  await assert.rejects(
    () => setupIntegration(t, { default: "request" }, "build", contentConfig),
    /cannot safely enumerate collections.*cannot identify statically/,
  );
  await assert.rejects(
    () =>
      setupIntegration(
        t,
        { default: "request" },
        "build",
        "const all = {}; export { all as collections };\n",
      ),
    /cannot safely enumerate collections.*cannot identify statically/,
  );
  await assert.rejects(
    () =>
      setupIntegration(
        t,
        { collections: { blog: "request" } },
        "build",
        contentConfig,
      ),
    /cannot safely enumerate collections.*cannot identify statically/,
  );

  const knownOverride = await setupIntegration(
    t,
    { collections: { docs: "request" } },
    "build",
    contentConfig,
  );
  const docs = { component: "src/pages/[...slug].astro", prerender: true };
  await knownOverride.routeSetup({ route: docs } as never);
  assert.equal(docs.prerender, false);
  const injected = knownOverride.injectedRoutes[0] as {
    entrypoint: URL;
  };
  assert.equal(injected.entrypoint.protocol, "file:");
  assert.match(injected.entrypoint.pathname, /request-route-inventory\.ts$/);
});
