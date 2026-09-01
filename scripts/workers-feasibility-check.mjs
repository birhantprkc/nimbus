#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { generateTemplates } from "../packages/create-nimbus-docs/scripts/copy-template.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GENERATED = join(ROOT, ".generated", "templates");
const SCAFFOLDER = join(ROOT, "packages", "create-nimbus-docs", "dist", "index.js");
const NIMBUS_PACKAGE = join(ROOT, "packages", "nimbus-docs", "package.json");
const FIXTURE = join(ROOT, "scripts", "fixtures", "workers-feasibility");
const STARTER = join(ROOT, "packages", "nimbus-starter-source", "src");
const PREFIX = "[workers-feasibility]";
const cleanup = [];

process.on("exit", () => {
  for (const path of cleanup) rmSync(path, { recursive: true, force: true });
});

function fail(message) {
  throw new Error(`${PREFIX} ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: options.cwd ?? ROOT,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(`command failed: ${bin} ${args.join(" ")}`);
  }
}

function filesUnder(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function outputText(path) {
  return filesUnder(path)
    .map((file) => readFileSync(file).toString("utf8"))
    .join("\n");
}

function routeForHtml(clientRoot, path) {
  const local = relative(clientRoot, path).split(sep).join("/");
  if (local === "index.html") return "/";
  if (local.endsWith("/index.html")) return `/${local.slice(0, -"index.html".length)}`;
  return `/${local.slice(0, -".html".length)}`;
}

function captureStaticPages(site) {
  const clientRoot = join(site, "dist", "client");
  const pages = new Map();
  for (const path of filesUnder(clientRoot).filter((file) => file.endsWith(".html"))) {
    pages.set(routeForHtml(clientRoot, path), readFileSync(path, "utf8"));
  }
  return pages;
}

function findMarkedPages(pages, attribute) {
  return [...pages].filter(([, html]) => html.includes(attribute));
}

function apiKinds(pages) {
  const found = new Map();
  for (const [route, html] of findMarkedPages(pages, "data-feasibility-api-kind")) {
    const kind = html.match(/data-feasibility-api-kind="([^"]+)"/)?.[1];
    if (kind) found.set(kind, { route, html });
  }
  return found;
}

function assertProse(html) {
  assert(html.includes("Request prose body."), "prose body did not render");
  assert(html.includes("Registered component"), "registered MDX component did not render");
  assert(html.includes("This content rendered from a reusable partial."), "partial did not render");
  assert(
    html.includes("data-heading-slugs=\"prose-heading,partial-heading\""),
    "compiled MDX and partial headings did not render",
  );
  assert(html.includes("class=\"astro-code"), "syntax-highlighted code did not render");
  assert(html.includes("nb-shiki-"), "syntax-highlighted tokens did not render");
}

function assertPreparedApi(html, kind) {
  assert(
    html.includes(`data-feasibility-api-kind="${kind}"`),
    `${kind} API page did not render`,
  );
  assert(html.includes("Feasibility API") || html.includes("Ping"), `${kind} API page is empty`);
  const bodyEvidence = {
    api: "API data prepared during content sync.",
    section: "Health operations.",
    operation: "Returns a <strong>healthy</strong> response.",
    schema: "A prepared schema page.",
  }[kind];
  assert(html.includes(bodyEvidence), `${kind} API layout body did not render`);
  if (kind === "operation") {
    assert(html.includes("/ping"), "operation endpoint did not render");
    assert(html.includes("Healthy response."), "operation response did not render");
  }
  if (kind === "schema") {
    assert(html.includes("Service health."), "schema field tree did not render");
  }
}

function assertProbe(html, value) {
  assert(html.includes(`data-request-probe="${value}"`), `request probe ${value} was not rendered`);
}

function assertNoProbe(html, value) {
  assert(!html.includes(`data-request-probe="${value}"`), `static page rendered request probe ${value}`);
}

async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => (port ? resolvePort(port) : reject(new Error("no free port"))));
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || !child.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolveClose) => child.once("close", resolveClose)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
}

async function withWorkerd(site, check) {
  const port = await freePort();
  const child = spawn("pnpm", ["exec", "wrangler", "dev", "--port", String(port)], {
    cwd: site,
    detached: process.platform !== "win32",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk.toString()));
  child.stderr.on("data", (chunk) => (logs += chunk.toString()));
  const origin = `http://127.0.0.1:${port}`;

  try {
    const deadline = Date.now() + 30_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) fail(`wrangler exited before serving\n${logs}`);
      try {
        await fetch(`${origin}/runtime/`);
        ready = true;
        break;
      } catch {
        await new Promise((resolveWait) => setTimeout(resolveWait, 250));
      }
    }
    if (!ready) fail(`wrangler did not become ready\n${logs}`);
    await check(origin);
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n${logs}`);
  } finally {
    await stop(child);
  }
}

async function request(origin, route, probe) {
  const response = await fetch(`${origin}${route}`, {
    headers: probe ? { "x-nimbus-probe": probe } : {},
    redirect: "manual",
  });
  return { response, html: await response.text() };
}

function build(site, policy) {
  writeRenderingPolicy(site, policy);
  run("pnpm", ["build"], { cwd: site });
}

function writeRenderingPolicy(site, policy) {
  mkdirSync(join(site, ".nimbus"), { recursive: true });
  writeFileSync(
    join(site, ".nimbus", "feasibility-rendering.json"),
    `${JSON.stringify(policy, null, 2)}\n`,
  );
}

console.log(`${PREFIX} building packages and generating the starter`);
const nimbusPackage = JSON.parse(readFileSync(NIMBUS_PACKAGE, "utf8"));
for (const dependency of [
  "micromark",
  "micromark-extension-gfm",
  "remark-mdx",
  "remark-parse",
]) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    assert(
      !nimbusPackage[field]?.[dependency],
      `${dependency} must remain fixture-local, not a published Nimbus ${field} entry`,
    );
  }
}
run("pnpm", ["--filter", "./packages/nimbus-docs", "--filter", "./packages/create-nimbus-docs", "build"]);
generateTemplates(GENERATED);

const packRoot = mkdtempSync(join(tmpdir(), "nimbus-workers-pack-"));
cleanup.push(packRoot);
run("pnpm", ["--filter", "./packages/nimbus-docs", "exec", "pnpm", "pack", "--pack-destination", packRoot]);
const tarballName = readdirSync(packRoot).find((name) => name.endsWith(".tgz"));
assert(tarballName, "nimbus tarball was not created");

const workRoot = mkdtempSync(join(tmpdir(), "nimbus-workers-feasibility-"));
cleanup.push(workRoot);
run("node", [
  SCAFFOLDER,
  "site",
  "--yes",
  "--skip-install",
  "--no-git",
  "--content",
  "starter",
  "--adapter",
  "cloudflare",
  "--template-dir",
  GENERATED,
], { cwd: workRoot });

const site = join(workRoot, "site");
rmSync(join(site, "src", "content", "docs"), { recursive: true, force: true });
rmSync(join(site, "src", "content", "partials"), { recursive: true, force: true });
for (const component of ["api-code-rail", "api-field-row", "api-layout", "api-sidebar"]) {
  cpSync(
    join(STARTER, "components", "ui", component),
    join(site, "src", "components", "ui", component),
    { recursive: true },
  );
}
cpSync(FIXTURE, site, { recursive: true });

const packagePath = join(site, "package.json");
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
packageJson.dependencies["@cloudflare/nimbus-docs"] = `file:${join(packRoot, tarballName)}`;
packageJson.dependencies["@bruits/satteri-wasm32-wasi"] = "0.9.5";
packageJson.dependencies["@readme/httpsnippet"] = "11.4.0";
packageJson.dependencies["@scalar/openapi-parser"] = "0.28.12";
packageJson.dependencies["hast-util-from-html"] = "2.0.3";
packageJson.dependencies["hast-util-sanitize"] = "5.0.2";
packageJson.dependencies["hast-util-to-html"] = "9.0.5";
packageJson.dependencies.micromark = "4.0.2";
packageJson.dependencies["micromark-extension-gfm"] = "3.0.0";
packageJson.dependencies["openapi-sampler"] = "1.7.4";
packageJson.dependencies["remark-mdx"] = "3.1.1";
packageJson.dependencies["remark-parse"] = "11.0.0";
packageJson.dependencies.unified = "11.0.5";
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
mkdirSync(join(site, "src", "pages", "api"), { recursive: true });

console.log(`${PREFIX} installing and typechecking the generated consumer`);
run("pnpm", ["install", "--no-frozen-lockfile"], { cwd: site });
writeRenderingPolicy(site, { docs: "build", api: "build" });
run("pnpm", ["typecheck"], { cwd: site });

console.log(`${PREFIX} establishing the all-build baseline`);
build(site, { docs: "build", api: "build" });
const staticPages = captureStaticPages(site);
const proseStatic = findMarkedPages(staticPages, "data-feasibility-prose");
assert(proseStatic.length === 1, `expected one prose fixture, found ${proseStatic.length}`);
assertProse(proseStatic[0][1]);
const staticKinds = apiKinds(staticPages);
for (const kind of ["api", "section", "operation", "schema"]) {
  assert(staticKinds.has(kind), `all-build baseline omitted the ${kind} API page`);
  assertPreparedApi(staticKinds.get(kind).html, kind);
}
const shikiCss = readFileSync(join(site, "dist", "client", "_nimbus", "shiki.css"), "utf8");
assert(shikiCss.includes(".nb-shiki-"), "all-build baseline omitted Shiki token styles");

function restoreShikiCss() {
  const cssDir = join(site, "dist", "client", "_nimbus");
  mkdirSync(cssDir, { recursive: true });
  writeFileSync(join(cssDir, "shiki.css"), shikiCss);
}

console.log(`${PREFIX} proving request prose beside build-rendered API pages`);
build(site, { docs: "request", api: "build" });
restoreShikiCss();
const requestProsePages = captureStaticPages(site);
assert(findMarkedPages(requestProsePages, "data-feasibility-prose").length === 0, "request prose emitted static HTML");
assert(apiKinds(requestProsePages).size === 4, "build API pages were not emitted beside request prose");
await withWorkerd(site, async (origin) => {
  const first = await request(origin, proseStatic[0][0], "prose-one");
  const second = await request(origin, proseStatic[0][0], "prose-two");
  assert(first.response.status === 200 && second.response.status === 200, "request prose was not 200");
  assertProse(first.html);
  assertProbe(first.html, "prose-one");
  assertProbe(second.html, "prose-two");
  const missing = await request(origin, "/missing-prose/", "missing");
  assert(missing.response.status === 404, "unknown request prose was not 404");
  const styles = await request(origin, "/_nimbus/shiki.css");
  assert(styles.response.status === 200 && styles.html.includes(".nb-shiki-"), "Shiki styles were not served");
  for (const { route } of staticKinds.values()) {
    const response = await request(origin, route, "static-api");
    assert(response.response.status === 200, `build-rendered API route ${route} was not 200`);
    assertNoProbe(response.html, "static-api");
  }
});

console.log(`${PREFIX} proving request API pages beside build-rendered prose`);
build(site, { docs: "build", api: "request" });
restoreShikiCss();
const requestApiPages = captureStaticPages(site);
assert(findMarkedPages(requestApiPages, "data-feasibility-prose").length === 1, "build prose was not emitted beside request API pages");
assert(apiKinds(requestApiPages).size === 0, "request API emitted static HTML");
const serverSource = outputText(join(site, "dist", "server"));
assert(serverSource.includes("Feasibility API"), "prepared API data is absent from the Worker bundle");
assert(!serverSource.includes("raw-openapi-must-not-ship"), "raw OpenAPI leaked into the Worker bundle");

await withWorkerd(site, async (origin) => {
  const prose = await request(origin, proseStatic[0][0], "static-prose");
  assert(prose.response.status === 200, "build-rendered prose was not 200");
  assertProse(prose.html);
  assertNoProbe(prose.html, "static-prose");

  for (const [kind, { route }] of staticKinds) {
    const first = await request(origin, route, `${kind}-one`);
    const second = await request(origin, route, `${kind}-two`);
    assert(
      first.response.status === 200 && second.response.status === 200,
      `${kind} API route ${route} returned ${first.response.status}/${second.response.status}: ${first.html.slice(0, 500)}`,
    );
    assertPreparedApi(first.html, kind);
    assertProbe(first.html, `${kind}-one`);
    assertProbe(second.html, `${kind}-two`);
  }
  const missing = await request(origin, "/api/missing/", "missing");
  assert(missing.response.status === 404, "unknown request API page was not 404");
});

console.log(`${PREFIX} proving both route families in request mode`);
build(site, { docs: "request", api: "request" });
restoreShikiCss();
const requestOnlyPages = captureStaticPages(site);
assert(findMarkedPages(requestOnlyPages, "data-feasibility-prose").length === 0, "request-only build emitted prose HTML");
assert(apiKinds(requestOnlyPages).size === 0, "request-only build emitted API HTML");
const requestOnlyServerSource = outputText(join(site, "dist", "server"));
assert(requestOnlyServerSource.includes("Feasibility API"), "prepared API data is absent from the request-only Worker bundle");
assert(!requestOnlyServerSource.includes("raw-openapi-must-not-ship"), "raw OpenAPI leaked into the request-only Worker bundle");
rmSync(join(site, "src", "content", "api", "openapi.json"));

await withWorkerd(site, async (origin) => {
  const prose = await request(origin, proseStatic[0][0], "both-prose");
  assert(prose.response.status === 200, "request-only prose was not 200");
  assertProse(prose.html);
  assertProbe(prose.html, "both-prose");

  for (const [kind, { route }] of staticKinds) {
    const api = await request(origin, route, `both-${kind}`);
    assert(api.response.status === 200, `request-only ${kind} API route was not 200`);
    assertPreparedApi(api.html, kind);
    assertProbe(api.html, `both-${kind}`);
  }
});

console.log(`${PREFIX} OK - technical build/request matrix passed on workerd`);
