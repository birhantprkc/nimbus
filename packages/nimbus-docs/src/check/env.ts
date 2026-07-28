/**
 * The **env** category: is the machine + project set up to build at all?
 * Node floor · config locatable · `site` not a placeholder · pagefind present
 * when search is on · wrangler present on a Cloudflare scaffold. Build-free:
 * filesystem + `process.versions` + the statically-parsed config only.
 */

import type { ConfigParseResult } from "../_internal/parse-nimbus-config.js";
import type { CheckFinding } from "./finding.js";
import { lineOf, relFile } from "./loc.js";
import { depInstalled, fileExists, hasPackageJson } from "./probe.js";

// Mirror of package.json `engines.node` — the bundled CLI can't read its own
// package.json at runtime. Keep in sync.
const MIN_NODE = "22.12.0";

const SITE_PLACEHOLDERS = new Set(["https://example.com", "CHANGE_ME"]);

export function checkEnv(cwd: string, parsed: ConfigParseResult): CheckFinding[] {
  const findings: CheckFinding[] = [];

  checkNodeVersion(findings);
  checkPackageJson(cwd, findings);
  checkConfigLocatable(findings, parsed);
  checkSitePlaceholder(findings, parsed);
  // No package.json ⇒ no node_modules; the dep checks would only add noise on
  // top of `no-package-json`, whose remedy is "run from the project root".
  if (!hasPackageJson(cwd)) return findings;
  checkPagefind(cwd, findings, parsed);
  checkWrangler(cwd, findings);

  return findings;
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

// No package.json here means the wrong cwd: a build would fail and a dep-install
// fix would resolve against a parent project. Flag it before anything tries.
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

// A missing/unreadable config is an env blocker; `no-object` (computed config)
// degrades to a warning — the config exists, it's just not statically legible.
function checkConfigLocatable(
  findings: CheckFinding[],
  parsed: ConfigParseResult,
): void {
  if (parsed.ok) return;
  const severity: CheckFinding["severity"] =
    parsed.reason === "no-object" ? "warn" : "error";
  findings.push({
    scope: "env",
    code: `nimbus/config-${parsed.reason}`,
    severity,
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
    // Fixable only when there's a literal span to rewrite; `requiresInput`
    // because the real URL can't be invented headless.
    fixable: span !== undefined,
    fix: {
      kind: "set-config",
      path: "site",
      requiresInput: true,
      suggestion: "set `site` to your production URL",
    },
  });
}

// Search defaults on. Skip when disabled or when `search` couldn't be resolved
// statically (don't false-positive on an unknown).
function checkPagefind(
  cwd: string,
  findings: CheckFinding[],
  parsed: ConfigParseResult,
): void {
  if (!parsed.ok) return;
  if (parsed.config.search === false) return;
  if (parsed.unresolved.includes("search")) return;

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

const WRANGLER_CONFIGS = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];

// Warning, not error: missing wrangler breaks `deploy`, not the build, so it
// must not default-fail the CI of anyone who deploys wrangler-less.
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

// Dotted numeric compare (`22.12.0` vs `20.11.1`); suffixes ignored. <0/0/>0.
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
