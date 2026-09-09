export interface ResolvedRouteLike {
  pattern: string;
  type: string;
  isPrerendered: boolean;
  origin: "internal" | "external" | "project";
  entrypoint?: string | null;
}

export interface ManagedRouteDeclaration {
  pattern: string;
  entrypoint: string;
  owner: "canonical" | "infrastructure";
  rendering: "build" | "request";
}

export interface FeatureRouteDeclaration {
  pattern: string;
  entrypoint: string;
  feature: string;
}

export interface UserRouteDeclaration {
  pattern: string;
  entrypoint: string;
}

export interface BuildReportInput {
  outputMode: "static" | "server";
  adapterName: string | null;
  routes: readonly ResolvedRouteLike[];
  prerenderedPageCount: number;
  requestRenderedPageCount?: number;
  managedRoutes?: readonly ManagedRouteDeclaration[];
  featureRoutes?: readonly FeatureRouteDeclaration[];
  userExtensibleRoutes?: readonly UserRouteDeclaration[];
  contentRoutePatterns?: readonly string[];
  serverFeatures?: readonly string[];
}

export interface BuildReport {
  summaryLine: string;
  violations: string[];
  onDemandDocRoutes: string[];
  customOnDemandRoutes: string[];
  customPrerenderedRoutes: string[];
  integrationOnDemandRoutes: string[];
  integrationPrerenderedRoutes: string[];
  nimbusRequestRoutes: string[];
  featureRoutes: string[];
  fatal: string | null;
}

export function analyzeBuild(input: BuildReportInput): BuildReport {
  const managedRoutes = input.managedRoutes ?? [];
  const featureRoutes = input.featureRoutes ?? [];
  const userExtensibleRoutes = input.userExtensibleRoutes ?? [];
  const contentPatterns = new Set(input.contentRoutePatterns ?? []);
  const managedByEntrypoint = groupBy(managedRoutes, (route) => route.entrypoint);
  const managedByPattern = groupBy(managedRoutes, (route) => route.pattern);
  const featuresByEntrypoint = groupBy(featureRoutes, (route) => route.entrypoint);
  const featuresByPattern = groupBy(featureRoutes, (route) => route.pattern);
  const userExtensibleIdentities = new Set(
    userExtensibleRoutes.map((route) => routeLocationIdentity(route)),
  );
  const activeDeclarations = [...managedRoutes, ...featureRoutes];
  for (const declarations of groupBy(
    activeDeclarations,
    routeLocationIdentity,
  ).values()) {
    if (new Set(declarations.map(routeIdentity)).size > 1) {
      throw new Error(
        `Nimbus route ${JSON.stringify(declarations[0]?.pattern)} at ${JSON.stringify(declarations[0]?.entrypoint)} matches multiple active declarations.`,
      );
    }
  }
  const routable = input.routes.filter(
    (r) => r.type === "page" || r.type === "endpoint",
  );
  const reportable = routable.filter((r) => r.origin !== "internal");
  const violations: string[] = [];
  const metadataFailures: string[] = [];
  const customOnDemandRoutes: string[] = [];
  const customPrerenderedRoutes: string[] = [];
  const integrationOnDemandRoutes: string[] = [];
  const integrationPrerenderedRoutes: string[] = [];
  const nimbusRequestRoutes: string[] = [];
  const declaredFeatureRoutes: string[] = [];
  const observedManagedRoutes = new Map<string, number>();
  const observedFeatureRoutes = new Map<string, number>();

  for (const route of input.routes) {
    const managedPattern = managedByPattern.get(route.pattern);
    const featurePattern = featuresByPattern.get(route.pattern);
    if (!route.entrypoint) {
      if (
        managedPattern ||
        featurePattern ||
        (route.origin !== "internal" &&
          (route.type === "page" || route.type === "endpoint"))
      ) {
        addUnique(metadataFailures, route.pattern);
      } else if (
        (route.type === "page" || route.type === "endpoint") &&
        contentPatterns.has(route.pattern)
      ) {
        addUnique(violations, route.pattern);
      }
      continue;
    }

    const managedEntrypoint = managedByEntrypoint.get(route.entrypoint);
    if (managedEntrypoint) {
      const owner = managedEntrypoint.find(
        (candidate) => candidate.pattern === route.pattern,
      );
      if (
        !owner ||
        route.isPrerendered !== (owner.rendering === "build")
      ) {
        addUnique(violations, route.pattern);
      } else {
        increment(observedManagedRoutes, routeIdentity(owner));
        if (!route.isPrerendered) {
          addUnique(nimbusRequestRoutes, route.pattern);
        }
      }
      continue;
    }

    const featureEntrypoint = featuresByEntrypoint.get(route.entrypoint);
    if (featureEntrypoint) {
      const owner = featureEntrypoint.find(
        (candidate) => candidate.pattern === route.pattern,
      );
      if (!owner || route.isPrerendered) {
        addUnique(violations, route.pattern);
      } else {
        increment(observedFeatureRoutes, routeIdentity(owner));
        addUnique(declaredFeatureRoutes, route.pattern);
      }
      continue;
    }

    if (managedPattern || featurePattern) {
      addUnique(violations, route.pattern);
      continue;
    }
    if (route.origin === "internal") continue;
    if (route.type !== "page" && route.type !== "endpoint") {
      continue;
    }
    if (
      contentPatterns.has(route.pattern) &&
      !userExtensibleIdentities.has(routeLocationIdentity(route))
    ) {
      addUnique(violations, route.pattern);
    } else if (route.origin === "external" && route.isPrerendered) {
      addUnique(integrationPrerenderedRoutes, route.pattern);
    } else if (route.origin === "external") {
      addUnique(integrationOnDemandRoutes, route.pattern);
    } else if (route.isPrerendered) {
      addUnique(customPrerenderedRoutes, route.pattern);
    } else {
      addUnique(customOnDemandRoutes, route.pattern);
    }
  }

  for (const route of managedRoutes) {
    if (observedManagedRoutes.get(routeIdentity(route)) !== 1) {
      addUnique(violations, route.pattern);
    }
  }
  for (const route of featureRoutes) {
    if (observedFeatureRoutes.get(routeIdentity(route)) !== 1) {
      addUnique(violations, route.pattern);
    }
  }

  const onDemandDocRoutes = [
    ...nimbusRequestRoutes,
    ...customOnDemandRoutes,
    ...integrationOnDemandRoutes,
    ...declaredFeatureRoutes,
  ];
  const moved = input.requestRenderedPageCount ?? 0;

  let fatal: string | null = null;
  if (input.outputMode === "server" && reportable.length === 0) {
    fatal =
      "nimbus: route ownership CANNOT BE VERIFIED — astro:routes:resolved " +
      "delivered no project or integration routes for this server build. " +
      "This is a reporter malfunction, not a clean pass. Failing the build.";
  } else if (metadataFailures.length > 0) {
    fatal =
      "nimbus: route ownership CANNOT BE VERIFIED — Astro did not provide " +
      `stable entrypoint metadata for: ${metadataFailures.join(", ")}. ` +
      "Nimbus cannot safely infer route ownership from URL patterns.";
  }

  return {
    summaryLine: formatSummary(input, {
      moved,
      customOnDemandRoutes,
      customPrerenderedRoutes,
      integrationOnDemandRoutes,
      integrationPrerenderedRoutes,
      nimbusRequestRoutes,
      featureRoutes: declaredFeatureRoutes,
    }),
    violations,
    onDemandDocRoutes,
    customOnDemandRoutes,
    customPrerenderedRoutes,
    integrationOnDemandRoutes,
    integrationPrerenderedRoutes,
    nimbusRequestRoutes,
    featureRoutes: declaredFeatureRoutes,
    fatal,
  };
}

interface SummaryRoutes {
  moved: number;
  customOnDemandRoutes: string[];
  customPrerenderedRoutes: string[];
  integrationOnDemandRoutes: string[];
  integrationPrerenderedRoutes: string[];
  nimbusRequestRoutes: string[];
  featureRoutes: string[];
}

function formatSummary(
  input: BuildReportInput,
  routes: SummaryRoutes,
): string {
  const adapter = (input.adapterName ?? "none").replace(/^@astrojs\//, "");
  const prerendered = input.prerenderedPageCount;
  const customStatic = formatRouteList(routes.customPrerenderedRoutes);
  const integrationStatic = formatRouteList(
    routes.integrationPrerenderedRoutes,
  );
  if (input.outputMode === "static") {
    return (
      `nimbus: output=static · adapter=${adapter} · ` +
      `docs prerendered=${prerendered}/${prerendered} · ` +
      `custom prerendered routes=${routes.customPrerenderedRoutes.length}${customStatic} · ` +
      `integration prerendered routes=${routes.integrationPrerenderedRoutes.length}${integrationStatic}`
    );
  }
  const total = prerendered + routes.moved;
  const features = input.serverFeatures?.length
    ? `[${input.serverFeatures.join(", ")}]`
    : "[]";
  return (
    `nimbus: output=server · adapter=${adapter} · ` +
    `docs prerendered=${prerendered}/${total} (${routes.moved} moved) · ` +
    `custom prerendered routes=${routes.customPrerenderedRoutes.length}${customStatic} · ` +
    `integration prerendered routes=${routes.integrationPrerenderedRoutes.length}${integrationStatic} · ` +
    `custom on-demand routes=${routes.customOnDemandRoutes.length}${formatRouteList(routes.customOnDemandRoutes)} · ` +
    `integration on-demand routes=${routes.integrationOnDemandRoutes.length}${formatRouteList(routes.integrationOnDemandRoutes)} · ` +
    `nimbus request routes=${routes.nimbusRequestRoutes.length}${formatRouteList(routes.nimbusRequestRoutes)} · ` +
    `feature routes=${routes.featureRoutes.length}${formatRouteList(routes.featureRoutes)} · ` +
    `server features=${features}`
  );
}

function formatRouteList(routes: readonly string[]): string {
  return routes.length ? ` (${routes.join(", ")})` : "";
}

function groupBy<T>(
  values: readonly T[],
  key: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const current = grouped.get(key(value)) ?? [];
    current.push(value);
    grouped.set(key(value), current);
  }
  return grouped;
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function routeLocationIdentity(route: {
  pattern: string;
  entrypoint?: string | null;
}): string {
  return `${route.pattern}\0${route.entrypoint ?? ""}`;
}

function routeIdentity(
  route: ManagedRouteDeclaration | FeatureRouteDeclaration,
): string {
  return [
    routeLocationIdentity(route),
    "owner" in route ? route.owner : "feature",
    "rendering" in route ? route.rendering : "request",
    "feature" in route ? route.feature : "",
  ].join("\0");
}

export function formatInvariantFailure(violations: readonly string[]): string {
  return (
    `nimbus: route ownership invariant FAILED — ${violations.length} route ` +
    `violation${violations.length === 1 ? "" : "s"}:\n` +
    violations.map((p) => `  - ${p}`).join("\n") +
    `\n\nNimbus-managed routes must match their declared entrypoint and rendering policy. ` +
    `Feature routes must match the active feature's entrypoint. Custom project and unrelated ` +
    `integration routes may use Astro's native prerender semantics when they do not impersonate ` +
    `a managed route or collide with published content.`
  );
}
