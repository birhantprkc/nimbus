import { test } from "node:test";
import assert from "node:assert/strict";

import {
  analyzeBuild,
  formatInvariantFailure,
  type ResolvedRouteLike,
} from "../src/_internal/build-report.js";

// The real server-build route set captured from Astro 7 (no feature).
const SERVER_ROUTES: ResolvedRouteLike[] = [
  { pattern: "/_server-islands/[name]", type: "page", isPrerendered: false },
  { pattern: "/_image", type: "endpoint", isPrerendered: false },
  { pattern: "/404", type: "page", isPrerendered: true },
  { pattern: "/llms.txt", type: "endpoint", isPrerendered: true },
  { pattern: "/[...slug]/index.md", type: "endpoint", isPrerendered: true },
  { pattern: "/", type: "page", isPrerendered: true },
  { pattern: "/[...slug]", type: "page", isPrerendered: true },
];

test("server + no feature: infra on-demand routes are explained, 0 violations (AC#3)", () => {
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

test("a non-`/_` on-demand route is an unexplained violation", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/_image", type: "endpoint", isPrerendered: false },
    { pattern: "/", type: "page", isPrerendered: true },
    { pattern: "/[...slug]", type: "page", isPrerendered: false },
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
    { pattern: "/", type: "page", isPrerendered: true },
    { pattern: "/llms.txt", type: "endpoint", isPrerendered: false },
  ];
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes,
    prerenderedPageCount: 1,
  });
  assert.deepEqual(r.violations, ["/llms.txt"]);
  assert.match(r.summaryLine, /\(1 moved\)/);
});

test("declared feature routes explain a non-`/_` on-demand route (BG-1b seam)", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/", type: "page", isPrerendered: true },
    { pattern: "/mcp", type: "endpoint", isPrerendered: false },
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

test("static build: adapter=none, on-demand routes=0, no server-features field", () => {
  const routes: ResolvedRouteLike[] = [
    { pattern: "/", type: "page", isPrerendered: true },
    { pattern: "/[...slug]", type: "page", isPrerendered: true },
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
    { pattern: "/old", type: "redirect", isPrerendered: false },
    { pattern: "/fb", type: "fallback", isPrerendered: false },
    { pattern: "/", type: "page", isPrerendered: true },
  ];
  const r = analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes,
    prerenderedPageCount: 1,
  });
  assert.deepEqual(r.violations, []);
});

test("failure message lists every unexplained route", () => {
  const msg = formatInvariantFailure(["/a", "/b"]);
  assert.match(msg, /2 unexplained on-demand routes/);
  assert.match(msg, /- \/a/);
  assert.match(msg, /- \/b/);
});
