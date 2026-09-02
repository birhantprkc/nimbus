import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeBuild,
  formatInvariantFailure,
  type ResolvedRouteLike,
} from "../src/_internal/build-report.js";

// The real server-build route set captured from Astro 7 (no feature).
const SERVER_ROUTES: ResolvedRouteLike[] = [
  { pattern: "/_server-islands/[name]", type: "page", isPrerendered: false, origin: "internal" },
  { pattern: "/custom-image", type: "endpoint", isPrerendered: false, origin: "internal" },
  { pattern: "/404", type: "page", isPrerendered: false, origin: "internal" },
  { pattern: "/llms.txt", type: "endpoint", isPrerendered: true, origin: "project" },
  { pattern: "/[...slug]/index.md", type: "endpoint", isPrerendered: true, origin: "project" },
  { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
  { pattern: "/[...slug]", type: "page", isPrerendered: true, origin: "project" },
];

test("server + no feature: infra on-demand routes are explained, 0 violations", () => {
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes: SERVER_ROUTES,
    prerenderedPageCount: 5,
  });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.onDemandDocRoutes, [], "/_ infra routes are not counted as doc on-demand");
  assert.match(r.summaryLine, /output=server/);
  assert.match(r.summaryLine, /adapter=node/);
  assert.equal(r.fatal, null);
  const full = analyzeBuild({
    outputMode: "server",
    adapterName: "@astrojs/node",
    routes: SERVER_ROUTES,
    prerenderedPageCount: 5,
  });
  assert.match(full.summaryLine, /adapter=node ·/);
  assert.match(r.summaryLine, /on-demand routes=0/);
  assert.match(r.summaryLine, /server features=\[\]/);
});

test("Astro Actions are excluded by internal origin", () => {
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes: [
      ...SERVER_ROUTES,
      { pattern: "/_actions/[...path]", type: "endpoint", isPrerendered: false, origin: "internal" },
    ],
    prerenderedPageCount: 5,
  });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.onDemandDocRoutes, []);
  assert.equal(r.fatal, null);
});

test("server build with no resolved routes is a fatal reporter malfunction, not a pass", () => {
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes: [],
    prerenderedPageCount: 0,
  });
  assert.deepEqual(r.violations, []);
  assert.match(r.fatal ?? "", /CANNOT BE VERIFIED/);
});

test("static build with no resolved routes does not trip the fatal guard", () => {
  const r = analyzeBuild({
    outputMode: "static",
    adapterName: null,
    routes: [],
    prerenderedPageCount: 0,
  });
  assert.equal(r.fatal, null);
});

test("a project on-demand route is an unexplained violation", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/custom-image", type: "endpoint", isPrerendered: false, origin: "internal" },
    { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
    { pattern: "/[...slug]", type: "page", isPrerendered: false, origin: "project" },
  ];
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "vercel",
    routes,
    prerenderedPageCount: 1,
  });
  assert.deepEqual(r.violations, ["/[...slug]"]);
});

test("a doc route forced on-demand fails the invariant", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
    { pattern: "/llms.txt", type: "endpoint", isPrerendered: false, origin: "project" },
  ];
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes,
    prerenderedPageCount: 1,
  });
  assert.deepEqual(r.violations, ["/llms.txt"]);
  assert.match(r.summaryLine, /\(0 moved\)/);
});

test("declared feature routes explain a non-`/_` on-demand route", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
    { pattern: "/mcp", type: "endpoint", isPrerendered: false, origin: "external" },
  ];
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "cloudflare",
    routes,
    prerenderedPageCount: 1,
    declaredFeatureRoutes: ["/mcp"],
    serverFeatures: ["hosted-mcp"],
  });
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.onDemandDocRoutes, ["/mcp"]);
  assert.match(r.summaryLine, /on-demand routes=1 \(\/mcp\)/);
  assert.match(r.summaryLine, /server features=\[hosted-mcp\]/);
});

test("declared request routes are explained and counted as moved docs", () => {
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "cloudflare",
    routes: [
      {
        pattern: "/[...slug]",
        type: "page",
        isPrerendered: false,
        origin: "project",
      },
    ],
    prerenderedPageCount: 3,
    requestRenderedPageCount: 100,
    declaredRequestRoutes: ["/[...slug]"],
  });

  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.onDemandDocRoutes, ["/[...slug]"]);
  assert.match(r.summaryLine, /docs prerendered=3\/103 \(100 moved\)/);
});

test("static build: adapter=none, on-demand routes=0, no server-features field", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
    { pattern: "/[...slug]", type: "page", isPrerendered: true, origin: "project" },
  ];
  const r = analyzeBuild({
    outputMode: "static",
    adapterName: null,
    routes,
    prerenderedPageCount: 2,
  });
  assert.deepEqual(r.violations, []);
  assert.equal(
    r.summaryLine,
    "nimbus: output=static · adapter=none · docs prerendered=2/2 · on-demand routes=0",
  );
});

test("redirect/fallback routes are ignored by the invariant", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/old", type: "redirect", isPrerendered: false, origin: "project" },
    { pattern: "/fb", type: "fallback", isPrerendered: false, origin: "project" },
    { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
  ];
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes,
    prerenderedPageCount: 1,
  });
  assert.deepEqual(r.violations, []);
});

test("a project route under an Astro-looking path still fails", () => {
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes: [
      { pattern: "/", type: "page", isPrerendered: true, origin: "project" },
      { pattern: "/_actions/custom", type: "endpoint", isPrerendered: false, origin: "project" },
    ],
    prerenderedPageCount: 1,
  });
  assert.deepEqual(r.violations, ["/_actions/custom"]);
});

test("server build with only internal routes is a fatal reporter malfunction", () => {
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes: [
      { pattern: "/custom-image", type: "endpoint", isPrerendered: false, origin: "internal" },
    ],
    prerenderedPageCount: 0,
  });
  assert.match(r.fatal ?? "", /CANNOT BE VERIFIED/);
});

test("failure message lists every unexplained route", () => {
  const msg = formatInvariantFailure(["/a", "/b"]);
  assert.match(msg, /2 unexplained on-demand routes/);
  assert.match(msg, /- \/a/);
  assert.match(msg, /- \/b/);
});
