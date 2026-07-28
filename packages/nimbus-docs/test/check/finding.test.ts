import assert from "node:assert/strict";
import { test } from "node:test";

import {
  summarize,
  exitCodeFor,
  sortFindings,
  fromDiagnostic,
  type CheckFinding,
} from "../../src/check/finding.js";
import type { Diagnostic } from "../../src/lint/diagnostic.js";

function finding(over: Partial<CheckFinding>): CheckFinding {
  return {
    scope: "env",
    code: "nimbus/x",
    severity: "error",
    message: "m",
    fixable: false,
    ...over,
  };
}

test("summarize counts errors, warnings, fixable", () => {
  const s = summarize(
    [
      finding({ severity: "error", fixable: true }),
      finding({ severity: "warn" }),
      finding({ severity: "error" }),
    ],
    123,
  );
  assert.deepEqual(s, { errors: 2, warnings: 1, fixable: 1, durationMs: 123 });
});

test("exit code is 1 only when errors exist; warnings keep 0", () => {
  assert.equal(exitCodeFor(summarize([finding({ severity: "warn" })], 0)), 0);
  assert.equal(exitCodeFor(summarize([finding({ severity: "error" })], 0)), 1);
  assert.equal(exitCodeFor(summarize([], 0)), 0);
});

test("sortFindings orders by scope, file, line, column, code", () => {
  const sorted = sortFindings([
    finding({ scope: "authoring", code: "b", file: "z.mdx", line: 2 }),
    finding({ scope: "env", code: "a" }),
    finding({ scope: "structure", code: "c", file: "a.ts", line: 1 }),
    finding({ scope: "authoring", code: "a", file: "z.mdx", line: 1 }),
  ]);
  assert.deepEqual(
    sorted.map((f) => f.scope),
    ["env", "structure", "authoring", "authoring"],
  );
  assert.equal(sorted[2]!.line, 1);
});

test("fromDiagnostic maps an auto-fixable diagnostic to lint-fix", () => {
  const d: Diagnostic = {
    code: "nimbus/frontmatter-shape",
    severity: "error",
    source: "docs-compiler",
    file: "a.mdx",
    line: 1,
    column: 1,
    message: "bad",
    fix: { description: "add title", edits: [{ range: [0, 0], text: "x" }] },
  };
  const f = fromDiagnostic(d);
  assert.equal(f.scope, "authoring");
  assert.equal(f.fixable, true);
  assert.equal(f.fix?.kind, "lint-fix");
});

test("fromDiagnostic maps an advisory-only fix to a non-fixable suggestion", () => {
  const d: Diagnostic = {
    code: "nimbus/internal-link",
    severity: "error",
    source: "docs-compiler",
    file: "a.mdx",
    line: 1,
    column: 1,
    message: "broken",
    fix: { description: "did you mean /cli?", edits: [] },
  };
  const f = fromDiagnostic(d);
  assert.equal(f.fixable, false);
  assert.equal(f.fix?.kind, "suggestion");
});
