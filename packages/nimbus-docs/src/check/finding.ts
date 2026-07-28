/**
 * `check` normalizes every check — env, structure, authoring — into one
 * `CheckFinding`. It's a superset of the lint `Diagnostic`: env/structure emit
 * codes outside the closed authoring `RuleCode` union and carry a
 * machine-actionable `fix`. The closed lint union stays untouched;
 * `fromDiagnostic` adapts authoring diagnostics in.
 */

import type { Diagnostic } from "../lint/diagnostic.js";

export type CheckScope = "env" | "structure" | "authoring";

export type CheckSeverity = "error" | "warn";

export interface CheckFix {
  kind: "set-config" | "install-dep" | "lint-fix" | "suggestion";
  path?: string;
  package?: string;
  dev?: boolean;
  /**
   * The fix needs a value only a human can supply (e.g. the production URL for
   * `site`). `check --fix` prompts on a TTY and skips it headless — it can't
   * invent one — so the summary never over-promises headless convergence.
   */
  requiresInput?: boolean;
  suggestion?: string;
}

export interface CheckFinding {
  scope: CheckScope;
  code: string;
  severity: CheckSeverity;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  fixable: boolean;
  fix?: CheckFix;
}

export interface CheckSummary {
  errors: number;
  warnings: number;
  fixable: number;
  durationMs: number;
}

export function summarize(
  findings: readonly CheckFinding[],
  durationMs: number,
): CheckSummary {
  let errors = 0;
  let warnings = 0;
  let fixable = 0;
  for (const f of findings) {
    if (f.severity === "error") errors++;
    else warnings++;
    if (f.fixable) fixable++;
  }
  return { errors, warnings, fixable, durationMs };
}

// AC #7: 0 clean · 1 error-severity findings · 2 usage (emitted by the CLI).
// Warnings alone keep exit 0 — a new check must never default-fail CI.
export function exitCodeFor(summary: CheckSummary): 0 | 1 {
  return summary.errors > 0 ? 1 : 0;
}

export function fromDiagnostic(d: Diagnostic): CheckFinding {
  const hasEdits = d.fix !== undefined && d.fix.edits.length > 0;
  const fix: CheckFix | undefined = d.fix
    ? hasEdits
      ? { kind: "lint-fix", suggestion: d.fix.description }
      : { kind: "suggestion", suggestion: d.fix.description }
    : undefined;
  return {
    scope: "authoring",
    code: d.code,
    severity: d.severity,
    file: d.file,
    line: d.line,
    column: d.column,
    message: d.message,
    fixable: hasEdits,
    ...(fix ? { fix } : {}),
  };
}

export function sortFindings(findings: CheckFinding[]): CheckFinding[] {
  const scopeRank: Record<CheckScope, number> = {
    env: 0,
    structure: 1,
    authoring: 2,
  };
  return findings.sort(
    (a, b) =>
      scopeRank[a.scope] - scopeRank[b.scope] ||
      (a.file ?? "").localeCompare(b.file ?? "") ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0) ||
      a.code.localeCompare(b.code),
  );
}
