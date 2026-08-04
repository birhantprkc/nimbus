/**
 * Internal barrel for the build-free `check` façade. The CLI (`cli/check.ts`)
 * and the `init` readiness pass import from here.
 */

export {
  runChecks,
  ALL_SCOPES,
  type CheckScopes,
  type CheckResult,
  type ScopeResult,
} from "./run.js";
export {
  summarize,
  exitCodeFor,
  sortFindings,
  fromDiagnostic,
  deriveScopeStatus,
  deriveReadiness,
  deriveTopStatus,
  type CheckFinding,
  type CheckFix,
  type CheckScope,
  type CheckSeverity,
  type CheckSummary,
  type Note,
  type ScopeReport,
  type ScopeStatus,
  type TopStatus,
  type Readiness,
} from "./finding.js";
export {
  formatCheckJson,
  formatCheckPretty,
  type PrettyOptions,
} from "./format.js";
