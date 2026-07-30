/**
 * The **env** category: is the machine + project set up to build a correct site
 * at all? Node floor · config locatable · `site` not a placeholder · pagefind
 * when search is on · wrangler on a Cloudflare scaffold. Build-free: filesystem
 * + `process.versions` + the statically-parsed config only. env's core always
 * runs, so it's always `evaluated`; a config we can't read statically becomes a
 * `config-not-evaluated` note (not a silent skip), which drives `readiness:
 * unknown`.
 */

import type { ConfigParseResult } from "../_internal/parse-nimbus-config.js";
import type { CheckFinding, Note, ScopeReport } from "./finding.js";
import { lineOf, relFile } from "./loc.js";
import { depInstalled, fileExists, hasPackageJson } from "./probe.js";

const MIN_NODE = "22.12.0";

const SITE_PLACEHOLDERS = new Set(["https://example.com", "CHANGE_ME"]);

export function checkEnv(cwd: string, parsed: ConfigParseResult): ScopeReport {
  const findings: CheckFinding[] = [];
  const notes: Note[] = [];

  checkNodeVersion(findings);
  checkPackageJson(cwd, findings);
  checkConfigLocatable(findings, notes, parsed);
  checkSitePlaceholder(findings, parsed);
  if (hasPackageJson(cwd)) {
    checkPagefind(cwd, findings, parsed);
    checkWrangler(cwd, findings);
  }

  return { scope: "env", findings, notes, evaluated: true };
}

function checkNodeVersion(findings: CheckFinding[]): void {
  const current = process.versions.node;
  if (compareSemver(current, MIN_NODE) < 0) {
    findings.push({
      scope: "env",
      code: "nimbus/node-version",
      severity: "error",
      message: `Node ${current} is below the supported floor (>=${MIN_NODE}). Upgrade Node to build.`,
      fixable: false,
    });
  }
}

function checkPackageJson(cwd: string, findings: CheckFinding[]): void {
  if (hasPackageJson(cwd)) return;
  findings.push({
    scope: "env",
    code: "nimbus/no-package-json",
    severity: "error",
    message:
      "No package.json here — run `nimbus-docs check` from your project root. Installing deps from here would resolve against a parent project.",
    fixable: false,
  });
}

function checkConfigLocatable(
  findings: CheckFinding[],
  notes: Note[],
  parsed: ConfigParseResult,
): void {
  if (parsed.ok) return;
  if (parsed.reason === "no-object") {
    notes.push({
      code: "nimbus/config-not-evaluated",
      reason: `${parsed.detail} — \`site\` and \`pagefind\` can't be read statically; a build validates the config.`,
      requiresBuild: true,
    });
    return;
  }
  findings.push({
    scope: "env",
    code: `nimbus/config-${parsed.reason}`,
    severity: "error",
    ...(parsed.file ? { file: relFile(parsed.file) } : {}),
    message: parsed.detail,
    fixable: false,
  });
}

function checkSitePlaceholder(
  findings: CheckFinding[],
  parsed: ConfigParseResult,
): void {
  if (!parsed.ok) return;
  const site = parsed.config.site;
  if (typeof site !== "string" || !SITE_PLACEHOLDERS.has(site)) return;

  const span = parsed.location.fields.get("site");
  findings.push({
    scope: "env",
    code: "nimbus/site-placeholder",
    severity: "error",
    file: relFile(parsed.location.file),
    ...(span ? { line: lineOf(parsed.location.source, span.keyStart) } : {}),
    message: `site is still "${site}" → breaks canonical URLs, OG, sitemap, and llms.txt.`,
    fixable: span !== undefined,
    ...(span
      ? {
          fix: {
            kind: "set-config" as const,
            path: "site",
            requiresInput: true,
            suggestion: "set `site` to your production URL",
          },
        }
      : {}),
  });
}

function checkPagefind(
  cwd: string,
  findings: CheckFinding[],
  parsed: ConfigParseResult,
): void {
  if (!parsed.ok) return;
  const search = parsed.config.search;
  if (search === false) return;
  if (parsed.unresolved.includes("search")) return;
  if (usesCustomSearchProvider(search)) return;

  if (depInstalled(cwd, "pagefind")) return;
  findings.push({
    scope: "env",
    code: "nimbus/pagefind-missing",
    severity: "error",
    message:
      "pagefind is not installed but search is enabled — the build's search index step will fail. Install pagefind, or set `search: false`.",
    fixable: true,
    fix: {
      kind: "install-dep",
      package: "pagefind",
      dev: true,
      suggestion: "install pagefind as a devDependency",
    },
  });
}

/** `search: { provider: "custom" }` ships its own index — pagefind isn't required. */
function usesCustomSearchProvider(search: unknown): boolean {
  return (
    typeof search === "object" &&
    search !== null &&
    "provider" in search &&
    (search as { provider?: unknown }).provider === "custom"
  );
}

const WRANGLER_CONFIGS = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];

function checkWrangler(cwd: string, findings: CheckFinding[]): void {
  const isCloudflare = WRANGLER_CONFIGS.some((f) => fileExists(cwd, f));
  if (!isCloudflare) return;
  if (depInstalled(cwd, "wrangler")) return;
  findings.push({
    scope: "env",
    code: "nimbus/wrangler-missing",
    severity: "warn",
    message:
      "This looks like a Cloudflare project (wrangler config present) but wrangler isn't installed — `deploy` will fail.",
    fixable: true,
    fix: {
      kind: "install-dep",
      package: "wrangler",
      dev: true,
      suggestion: "install wrangler as a devDependency",
    },
  });
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
