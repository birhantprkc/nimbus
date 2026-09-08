import assert from "node:assert/strict";
import { test } from "node:test";

import {
  analyzeBuild,
  formatInvariantFailure,
  type FeatureRouteDeclaration,
  type ManagedRouteDeclaration,
  type ResolvedRouteLike,
  type UserRouteDeclaration,
} from "../src/_internal/build-report.js";
import { STARTER_ROUTE_INVENTORY } from "../src/_internal/route-ownership.js";

const canonical = (
  rendering: "build" | "request" = "build",
): ManagedRouteDeclaration => ({
  pattern: "/[...slug]",
  entrypoint: "src/pages/[...slug].astro",
  owner: "canonical",
  rendering,
});

const feature: FeatureRouteDeclaration = {
  pattern: "/mcp",
  entrypoint: "src/pages/mcp.ts",
  feature: "hosted-mcp",
};

const userExtensible: UserRouteDeclaration = {
  pattern: "/",
  entrypoint: "src/pages/index.astro",
};

function projectRoute(
  pattern: string,
  entrypoint: string,
  isPrerendered: boolean,
  type: "page" | "endpoint" = "page",
): ResolvedRouteLike {
  return { pattern, entrypoint, type, isPrerendered, origin: "project" };
}

function externalRoute(
  pattern: string,
  entrypoint: string,
  isPrerendered: boolean,
  type: "page" | "endpoint" = "endpoint",
): ResolvedRouteLike {
  return { pattern, entrypoint, type, isPrerendered, origin: "external" };
}

function report(
  routes: readonly ResolvedRouteLike[],
  overrides: Partial<Parameters<typeof analyzeBuild>[0]> = {},
) {
  return analyzeBuild({
    outputMode: "server",
    adapterName: "node",
    routes,
    prerenderedPageCount: 1,
    ...overrides,
  });
}

test("project-owned pages and endpoints may render on request without Nimbus registration", () => {
  for (const adapterName of ["cloudflare", "vercel", "netlify", "node"]) {
    const result = report(
      [
        projectRoute("/foo", "src/pages/foo.astro", false),
        projectRoute("/api/ping", "src/pages/api/ping.ts", false, "endpoint"),
        projectRoute("/products/[id]", "src/pages/products/[id].astro", false),
      ],
      { adapterName },
    );
    assert.deepEqual(result.violations, []);
    assert.equal(result.fatal, null);
    assert.deepEqual(result.customOnDemandRoutes, [
      "/foo",
      "/api/ping",
      "/products/[id]",
    ]);
    assert.match(result.summaryLine, /custom on-demand routes=3/);
  }
});

test("a custom prerendered route remains static and is reported separately", () => {
  const result = report([
    projectRoute("/static", "src/pages/static.astro", true),
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.customPrerenderedRoutes, ["/static"]);
  assert.deepEqual(result.customOnDemandRoutes, []);
  assert.match(result.summaryLine, /custom on-demand routes=0/);
});

test("canonical collection routes must match entrypoint and rendering policy", () => {
  const allowed = report(
    [projectRoute("/[...slug]", "src/pages/[...slug].astro", false)],
    {
      managedRoutes: [canonical("request")],
      requestRenderedPageCount: 100,
      prerenderedPageCount: 3,
    },
  );
  assert.deepEqual(allowed.violations, []);
  assert.deepEqual(allowed.nimbusRequestRoutes, ["/[...slug]"]);
  assert.match(allowed.summaryLine, /docs prerendered=3\/103 \(100 moved\)/);
  assert.match(allowed.summaryLine, /nimbus request routes=1/);

  const buildDrift = report(
    [projectRoute("/[...slug]", "src/pages/[...slug].astro", false)],
    { managedRoutes: [canonical("build")] },
  );
  assert.deepEqual(buildDrift.violations, ["/[...slug]"]);

  const requestDrift = report(
    [projectRoute("/[...slug]", "src/pages/[...slug].astro", true)],
    { managedRoutes: [canonical("request")] },
  );
  assert.deepEqual(requestDrift.violations, ["/[...slug]"]);
});

test("conflicting active declarations for one route are rejected", () => {
  assert.throws(
    () =>
      report(
        [projectRoute("/[...slug]", "src/pages/[...slug].astro", false)],
        {
          managedRoutes: [canonical("request")],
          featureRoutes: [
            {
              pattern: "/[...slug]",
              entrypoint: "src/pages/[...slug].astro",
              feature: "conflicting-feature",
            },
          ],
        },
      ),
    /matches multiple active declarations/,
  );
});

test("scaffolded Markdown and llms.txt endpoints remain user-owned", () => {
  for (const route of STARTER_ROUTE_INVENTORY.filter(
    (candidate) => candidate.role === "user-owned",
  )) {
    const result = report([
      projectRoute(
        route.pattern,
        `src/${route.entrypoint}`,
        false,
        route.entrypoint.endsWith(".astro") ? "page" : "endpoint",
      ),
    ]);
    assert.deepEqual(result.violations, [], route.entrypoint);
    assert.deepEqual(result.customOnDemandRoutes, [route.pattern]);
  }
});

test("feature routes require matching feature, pattern, and entrypoint", () => {
  const allowed = report(
    [projectRoute("/mcp", "src/pages/mcp.ts", false, "endpoint")],
    { featureRoutes: [feature], serverFeatures: ["hosted-mcp"] },
  );
  assert.deepEqual(allowed.violations, []);
  assert.deepEqual(allowed.featureRoutes, ["/mcp"]);
  assert.deepEqual(allowed.onDemandDocRoutes, ["/mcp"]);
  assert.match(allowed.summaryLine, /feature routes=1 \(\/mcp\)/);
  assert.match(allowed.summaryLine, /server features=\[hosted-mcp\]/);

  const impersonator = report(
    [projectRoute("/mcp", "src/pages/not-mcp.ts", false, "endpoint")],
    { featureRoutes: [feature] },
  );
  assert.deepEqual(impersonator.violations, ["/mcp"]);

  const patternDrift = report(
    [projectRoute("/other", "src/pages/mcp.ts", false, "endpoint")],
    { featureRoutes: [feature] },
  );
  assert.deepEqual(patternDrift.violations, ["/other", "/mcp"]);

  const inactiveProjectRoute = report([
    projectRoute("/mcp", "src/pages/not-mcp.ts", false, "endpoint"),
  ]);
  assert.deepEqual(inactiveProjectRoute.violations, []);
  assert.deepEqual(inactiveProjectRoute.customOnDemandRoutes, ["/mcp"]);

  const inactiveIntegrationRoute = report([
    externalRoute("/mcp", "node_modules/example/mcp.ts", false),
  ]);
  assert.deepEqual(inactiveIntegrationRoute.violations, []);
  assert.deepEqual(inactiveIntegrationRoute.integrationOnDemandRoutes, [
    "/mcp",
  ]);
});

test("every active managed and feature declaration must resolve exactly once", () => {
  const missingManaged = report(
    [projectRoute("/custom", "src/pages/custom.astro", false)],
    { managedRoutes: [canonical("request")] },
  );
  assert.deepEqual(missingManaged.violations, ["/[...slug]"]);

  const missingFeature = report(
    [projectRoute("/custom", "src/pages/custom.astro", false)],
    { featureRoutes: [feature] },
  );
  assert.deepEqual(missingFeature.violations, ["/mcp"]);

  const duplicateManaged = report(
    [
      projectRoute("/[...slug]", "src/pages/[...slug].astro", false),
      projectRoute("/[...slug]", "src/pages/[...slug].astro", false),
    ],
    { managedRoutes: [canonical("request")] },
  );
  assert.deepEqual(duplicateManaged.violations, ["/[...slug]"]);
});

test("same-pattern impersonation of a managed route fails closed", () => {
  const canonicalImpersonator = report(
    [projectRoute("/[...slug]", "src/pages/not-docs.astro", true)],
    { managedRoutes: [canonical()] },
  );
  assert.deepEqual(canonicalImpersonator.violations, ["/[...slug]"]);
});

test("unrelated integration routes compose and are reported separately", () => {
  const result = report([
    externalRoute("/integration/static", "node_modules/example/static.ts", true),
    externalRoute(
      "/integration/request",
      "node_modules/example/request.ts",
      false,
    ),
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.integrationPrerenderedRoutes, [
    "/integration/static",
  ]);
  assert.deepEqual(result.integrationOnDemandRoutes, [
    "/integration/request",
  ]);
  assert.match(result.summaryLine, /integration prerendered routes=1/);
  assert.match(result.summaryLine, /integration on-demand routes=1/);
});

test("declared Nimbus infrastructure is allowed by exact identity", () => {
  const infrastructure: ManagedRouteDeclaration = {
    pattern: "/_nimbus/request-route-inventory.json",
    entrypoint:
      "node_modules/@cloudflare/nimbus-docs/dist/_internal/request-route-inventory.js",
    owner: "infrastructure",
    rendering: "build",
  };
  const result = report(
    [externalRoute(infrastructure.pattern, infrastructure.entrypoint, true)],
    { managedRoutes: [infrastructure] },
  );
  assert.deepEqual(result.violations, []);
  assert.equal(result.fatal, null);

  const renderingDrift = report(
    [externalRoute(infrastructure.pattern, infrastructure.entrypoint, false)],
    { managedRoutes: [infrastructure] },
  );
  assert.deepEqual(renderingDrift.violations, [infrastructure.pattern]);

  const projectImpersonator = report(
    [
      projectRoute(
        infrastructure.pattern,
        "src/pages/_nimbus/request-route-inventory.json.ts",
        true,
        "endpoint",
      ),
    ],
    { managedRoutes: [infrastructure] },
  );
  assert.deepEqual(projectImpersonator.violations, [infrastructure.pattern]);
});

test("missing entrypoint provenance is a fatal metadata failure", () => {
  for (const isPrerendered of [false, true]) {
    const result = report([
      {
        pattern: "/foo",
        type: "page",
        isPrerendered,
        origin: "project",
      },
    ]);
    assert.deepEqual(result.violations, []);
    assert.match(result.fatal ?? "", /CANNOT BE VERIFIED/);
    assert.match(result.fatal ?? "", /entrypoint metadata/);
  }
});

test("catch-all overlap is allowed but an exact published-content collision fails", () => {
  const free = report(
    [
      projectRoute("/[...slug]", "src/pages/[...slug].astro", true),
      projectRoute("/foo", "src/pages/foo.astro", false),
    ],
    {
      managedRoutes: [canonical("build")],
      contentRoutePatterns: ["/bar"],
    },
  );
  assert.deepEqual(free.violations, []);

  const dynamicOverlap = report(
    [
      projectRoute("/[...slug]", "src/pages/[...slug].astro", true),
      projectRoute(
        "/[section]/[slug]",
        "src/pages/[section]/[slug].astro",
        false,
      ),
      projectRoute("/[...path]", "src/pages/[...path].astro", false),
    ],
    { managedRoutes: [canonical("build")] },
  );
  assert.deepEqual(dynamicOverlap.violations, []);

  const owned = report(
    [
      projectRoute("/[...slug]", "src/pages/[...slug].astro", true),
      projectRoute("/foo", "src/pages/foo.astro", false),
    ],
    {
      managedRoutes: [canonical("build")],
      contentRoutePatterns: ["/foo"],
    },
  );
  assert.deepEqual(owned.violations, ["/foo"]);

  const staticOwned = report(
    [projectRoute("/foo", "src/pages/foo.astro", true)],
    { contentRoutePatterns: ["/foo"] },
  );
  assert.deepEqual(staticOwned.violations, ["/foo"]);

  const intentionalRoot = report(
    [projectRoute("/", "src/pages/index.astro", true)],
    {
      contentRoutePatterns: ["/"],
      userExtensibleRoutes: [userExtensible],
    },
  );
  assert.deepEqual(intentionalRoot.violations, []);
});

test("Astro internal routes are ignored", () => {
  const result = report([
    {
      pattern: "/_actions/[...path]",
      type: "endpoint",
      isPrerendered: false,
      origin: "internal",
    },
  ]);
  assert.deepEqual(result.violations, []);
  assert.deepEqual(result.onDemandDocRoutes, []);
});

test("unrelated project redirects and fallbacks preserve native Astro behavior", () => {
  const result = report([
    projectRoute("/home", "src/pages/home.astro", true),
    {
      pattern: "/old",
      type: "redirect",
      isPrerendered: false,
      origin: "project",
    },
    {
      pattern: "/fallback",
      type: "fallback",
      isPrerendered: false,
      origin: "project",
    },
    {
      pattern: "/integration-redirect",
      type: "redirect",
      isPrerendered: false,
      origin: "external",
    },
    {
      pattern: "/integration-fallback",
      type: "fallback",
      isPrerendered: false,
      origin: "external",
    },
  ]);
  assert.deepEqual(result.violations, []);
  assert.equal(result.fatal, null);
});

test("redirects and internal routes cannot impersonate managed patterns", () => {
  const infrastructure: ManagedRouteDeclaration = {
    pattern: "/_nimbus/request-route-inventory.json",
    entrypoint:
      "node_modules/@cloudflare/nimbus-docs/dist/_internal/request-route-inventory.js",
    owner: "infrastructure",
    rendering: "build",
  };
  const redirect = report(
    [
      projectRoute("/home", "src/pages/home.astro", true),
      {
        pattern: infrastructure.pattern,
        type: "redirect",
        isPrerendered: false,
        origin: "project",
      },
    ],
    { managedRoutes: [infrastructure] },
  );
  assert.match(redirect.fatal ?? "", /entrypoint metadata/);

  const internal = report(
    [
      projectRoute("/home", "src/pages/home.astro", true),
      {
        pattern: infrastructure.pattern,
        type: "endpoint",
        isPrerendered: false,
        origin: "internal",
      },
    ],
    { managedRoutes: [infrastructure] },
  );
  assert.match(internal.fatal ?? "", /entrypoint metadata/);

  const contentRedirect = report(
    [
      projectRoute("/home", "src/pages/home.astro", true),
      {
        pattern: "/guide",
        type: "redirect",
        isPrerendered: false,
        origin: "project",
      },
    ],
    { contentRoutePatterns: ["/guide"] },
  );
  assert.deepEqual(contentRedirect.violations, []);
});

test("server builds with no reportable routes fail verification", () => {
  const empty = report([]);
  assert.match(empty.fatal ?? "", /CANNOT BE VERIFIED/);

  const internalOnly = report([
    {
      pattern: "/custom-image",
      type: "endpoint",
      isPrerendered: false,
      origin: "internal",
    },
  ]);
  assert.match(internalOnly.fatal ?? "", /CANNOT BE VERIFIED/);
});

test("static builds do not require resolved route metadata", () => {
  const result = analyzeBuild({
    outputMode: "static",
    adapterName: null,
    routes: [],
    prerenderedPageCount: 2,
  });
  assert.equal(result.fatal, null);
  assert.equal(
    result.summaryLine,
    "nimbus: output=static · adapter=none · docs prerendered=2/2 · custom prerendered routes=0 · integration prerendered routes=0",
  );
});

test("failure message explains exact ownership requirements", () => {
  const message = formatInvariantFailure(["/a", "/b"]);
  assert.match(message, /2 route violations/);
  assert.match(message, /- \/a/);
  assert.match(message, /- \/b/);
  assert.match(message, /Custom project and unrelated integration routes/);
});
