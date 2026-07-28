/**
 * Build-free façade: run the three check categories and return one normalized
 * result. Shared by the CLI, `init`, and any programmatic caller. The
 * categories are an engineering seam, not a user-facing menu.
 */

import {
  parseNimbusConfig,
  type ConfigLocation,
  type ConfigParseResult,
} from "../_internal/parse-nimbus-config.js";
import { checkAuthoring } from "./authoring.js";
import { checkEnv } from "./env.js";
import {
  sortFindings,
  summarize,
  type CheckFinding,
  type CheckSummary,
} from "./finding.js";
import { checkStructure } from "./structure.js";

/** Which categories to run. Omitted flags default to all three (`check`). */
export interface CheckScopes {
  env: boolean;
  structure: boolean;
  authoring: boolean;
}

export const ALL_SCOPES: CheckScopes = {
  env: true,
  structure: true,
  authoring: true,
};

export interface CheckResult {
  findings: CheckFinding[];
  summary: CheckSummary;
  scopes: CheckScopes;
  /** The statically-parsed config (for callers that want to inspect it). */
  parsed: ConfigParseResult;
  /** Present when the config object was locatable — the `--fix` write handle. */
  location: ConfigLocation | null;
}

export async function runChecks(
  cwd: string,
  scopes: CheckScopes = ALL_SCOPES,
): Promise<CheckResult> {
  const started = performance.now();

  // Parse once: env and structure both read it, and `--fix` writes through
  // its `location`.
  const parsed = parseNimbusConfig(cwd);

  const findings: CheckFinding[] = [];
  if (scopes.env) findings.push(...checkEnv(cwd, parsed));
  if (scopes.structure) findings.push(...(await checkStructure(cwd, parsed)));
  if (scopes.authoring) findings.push(...checkAuthoring(cwd));

  sortFindings(findings);
  const durationMs = Math.round(performance.now() - started);

  return {
    findings,
    summary: summarize(findings, durationMs),
    scopes,
    parsed,
    location: parsed.ok ? parsed.location : null,
  };
}
