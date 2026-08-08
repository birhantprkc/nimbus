/**
 * Prerender invariant reporter (ticket AC#2, #13). From the routes Astro
 * resolves at build, it asserts the bidirectional invariant — every public doc
 * route stays prerendered, and every on-demand route is *explained* — and
 * produces the build summary line. An unexplained on-demand route is a build
 * failure, not a warning.
 *
 * Empirically (Astro 7, `output: "server"`, no feature) Astro injects two
 * internal on-demand routes, `/_server-islands/[name]` and `/_image`, both
 * under the reserved `/_` prefix. Server-Island backing endpoints are
 * explicitly part of the explained set, so the rule is: an on-demand route
 * under `/_` is infrastructure (explained); a non-`/_` on-demand route is
 * explained only if it's a declared feature route (`/mcp`, …, empty in BG-1a).
 */

export interface ResolvedRouteLike {
  pattern: string;
  type: string;
  isPrerendered: boolean;
}

export interface BuildReportInput {
  outputMode: "static" | "server";
  adapterName: string | null;
  routes: readonly ResolvedRouteLike[];
  prerenderedPageCount: number;
  declaredFeatureRoutes?: readonly string[];
  serverFeatures?: readonly string[];
}

export interface BuildReport {
  summaryLine: string;
  violations: string[];
  onDemandDocRoutes: string[];
  fatal: string | null;
}

const INFRA_PREFIX = "/_";

export function analyzeBuild(input: BuildReportInput): BuildReport {
  const declared = new Set(input.declaredFeatureRoutes ?? []);
  const routable = input.routes.filter(
    (r) => r.type === "page" || r.type === "endpoint",
  );
  const nonInfraOnDemand = routable.filter(
    (r) => !r.isPrerendered && !r.pattern.startsWith(INFRA_PREFIX),
  );
  const onDemandDocRoutes = nonInfraOnDemand.map((r) => r.pattern);
  const violations = nonInfraOnDemand
    .filter((r) => !declared.has(r.pattern))
    .map((r) => r.pattern);

  const fatal =
    input.outputMode === "server" && routable.length === 0
      ? "nimbus: prerender invariant CANNOT BE VERIFIED — astro:routes:resolved " +
        "delivered no routable routes for this server build. This is a reporter " +
        "malfunction (a server build always resolves the doc route plus Astro's " +
        "infrastructure routes), not a clean pass. Failing the build."
      : null;

  return {
    summaryLine: formatSummary(input, onDemandDocRoutes, violations.length),
    violations,
    onDemandDocRoutes,
    fatal,
  };
}

function formatSummary(
  input: BuildReportInput,
  onDemandDocRoutes: string[],
  moved: number,
): string {
  const adapter = (input.adapterName ?? "none").replace(/^@astrojs\//, "");
  const prerendered = input.prerenderedPageCount;
  if (input.outputMode === "static") {
    return (
      `nimbus: output=static · adapter=${adapter} · ` +
      `docs prerendered=${prerendered}/${prerendered} · on-demand routes=0`
    );
  }
  const total = prerendered + moved;
  const odList = onDemandDocRoutes.length
    ? ` (${onDemandDocRoutes.join(", ")})`
    : "";
  const features = input.serverFeatures?.length
    ? `[${input.serverFeatures.join(", ")}]`
    : "[]";
  return (
    `nimbus: output=server · adapter=${adapter} · ` +
    `docs prerendered=${prerendered}/${total} (${moved} moved) · ` +
    `on-demand routes=${onDemandDocRoutes.length}${odList} · ` +
    `server features=${features}`
  );
}

export function formatInvariantFailure(violations: readonly string[]): string {
  return (
    `nimbus: prerender invariant FAILED — ${violations.length} unexplained ` +
    `on-demand route${violations.length === 1 ? "" : "s"}:\n` +
    violations.map((p) => `  - ${p}`).join("\n") +
    `\n\nEvery public doc route must stay prerendered (\`export const prerender = true\`). ` +
    `A route is on-demand because it opted out — restore its prerender export, or ` +
    `(if it's a server feature endpoint) declare it so the reporter can explain it.`
  );
}
