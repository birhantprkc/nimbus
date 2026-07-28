/**
 * `check` output: the agent JSON envelope
 * `{ ok, summary{errors,warnings,fixable,durationMs}, findings[] }`, and a
 * grouped, timed pretty form where success is a moment.
 */

import type { CheckResult, CheckScopes } from "./run.js";
import type { CheckFinding, CheckScope } from "./finding.js";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
};

export interface PrettyOptions {
  color: boolean;
  quiet?: boolean;
  invocation: string;
}

const SCOPE_LABELS: Record<CheckScope, string> = {
  env: "Environment",
  structure: "Structure",
  authoring: "Authoring",
};

const SCOPE_ORDER: CheckScope[] = ["env", "structure", "authoring"];

export function formatCheckJson(result: CheckResult): string {
  return JSON.stringify(
    {
      ok: result.summary.errors === 0,
      summary: {
        errors: result.summary.errors,
        warnings: result.summary.warnings,
        fixable: result.summary.fixable,
        durationMs: result.summary.durationMs,
      },
      findings: result.findings.map((f) => ({
        scope: f.scope,
        code: f.code,
        severity: f.severity,
        ...(f.file ? { file: f.file } : {}),
        ...(f.line !== undefined ? { line: f.line } : {}),
        ...(f.column !== undefined ? { column: f.column } : {}),
        message: f.message,
        fixable: f.fixable,
        ...(f.fix ? { fix: f.fix } : {}),
      })),
    },
    null,
    2,
  );
}

export function formatCheckPretty(
  result: CheckResult,
  opts: PrettyOptions,
): string {
  const paint = (code: string, text: string) =>
    opts.color ? `${code}${text}${COLORS.reset}` : text;

  const shown = opts.quiet
    ? result.findings.filter((f) => f.severity === "error")
    : result.findings;

  const lines: string[] = [""];

  for (const scope of SCOPE_ORDER) {
    if (!scopeRun(result.scopes, scope)) continue;
    const label = SCOPE_LABELS[scope].padEnd(14);
    const scopeFindings = shown.filter((f) => f.scope === scope);

    if (scopeFindings.length === 0) {
      lines.push(`  ${label}${paint(COLORS.green, "✓ ok")}`);
      continue;
    }
    lines.push(`  ${label}`);
    for (const f of scopeFindings) lines.push(...renderFinding(f, paint));
  }

  lines.push("");
  lines.push(...renderFooter(result, shown, opts, paint));
  lines.push("");
  return lines.join("\n");
}

function renderFinding(
  f: CheckFinding,
  paint: (code: string, text: string) => string,
): string[] {
  const mark =
    f.severity === "error" ? paint(COLORS.red, "✗") : paint(COLORS.yellow, "!");
  const out = [`    ${mark} ${f.message}`];
  const loc = locationOf(f);
  out.push(`      ${paint(COLORS.dim, [loc, f.code].filter(Boolean).join("  "))}`);
  if (f.fix?.suggestion) {
    out.push(`      ${paint(COLORS.dim, `fix: ${f.fix.suggestion}`)}`);
  }
  return out;
}

function renderFooter(
  result: CheckResult,
  shown: CheckFinding[],
  opts: PrettyOptions,
  paint: (code: string, text: string) => string,
): string[] {
  const { errors, warnings, durationMs } = result.summary;
  const secs = (durationMs / 1000).toFixed(durationMs < 100 ? 2 : 1);

  if (errors === 0) {
    const advisory =
      warnings > 0 && !opts.quiet
        ? paint(COLORS.dim, ` (${warnings} advisory warning${warnings === 1 ? "" : "s"})`)
        : "";
    return [
      paint(COLORS.green, `  ✓ Ready to build — checked in ${secs}s`) + advisory,
    ];
  }

  const autoFixable = shown.filter((f) => f.fixable && !f.fix?.requiresInput).length;
  const needsInput = shown.filter((f) => f.fixable && f.fix?.requiresInput).length;

  const parts = [`${shown.length} problem${shown.length === 1 ? "" : "s"}`];
  if (autoFixable > 0) parts.push(`${autoFixable} auto-fixable`);
  if (needsInput > 0) parts.push(`${needsInput} need input`);

  const out = [paint(COLORS.red, `  ✗ ${parts.join(" · ")}`)];
  if (autoFixable + needsInput > 0) {
    out.push(paint(COLORS.dim, `    → run \`${opts.invocation}\``));
  }
  out.push(paint(COLORS.dim, `  checked in ${secs}s`));
  return out;
}

function locationOf(f: CheckFinding): string {
  if (!f.file) return "";
  if (f.line === undefined) return f.file;
  if (f.column === undefined) return `${f.file}:${f.line}`;
  return `${f.file}:${f.line}:${f.column}`;
}

function scopeRun(scopes: CheckScopes, scope: CheckScope): boolean {
  return scopes[scope];
}
