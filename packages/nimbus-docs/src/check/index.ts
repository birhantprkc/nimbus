/**
 * Internal barrel for the build-free `check` façade. The CLI (`cli/check.ts`)
 * and the `init` readiness pass import from here.
 */

export {
  runChecks,
  ALL_SCOPES,
  type CheckScopes,
  type CheckResult,
} from "./run.js";
export {
  summarize,
  exitCodeFor,
  sortFindings,
  fromDiagnostic,
  type CheckFinding,
  type CheckFix,
  type CheckScope,
  type CheckSeverity,
  type CheckSummary,
} from "./finding.js";
export {
  formatCheckJson,
  formatCheckPretty,
  type PrettyOptions,
} from "./format.js";
