// Enforces the seam rule: `./api` exposes ONLY the frozen view-model. No spine
// IR type (DocsModel/Node/Facts/NodeKind — all declared in `_internal/api/model.ts`)
// may cross the boundary, and the runtime export set is exactly the documented
// helpers + the version constant + ApiBuildError.
//
// The type surface is checked with the TypeScript type checker, not a regex:
// the checker resolves `export *`, re-exports, and aliases to their ORIGINAL
// declaration, so a barrel dump or an aliased repoint (`export type { Node as
// ApiNodeKind }`) can't slip an IR type through under an innocent name.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import * as api from "../src/api/index.js";

const ENTRY = fileURLToPath(new URL("../src/api/index.ts", import.meta.url));
const PKG_ROOT = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

// The documented type surface. Adding a view type here is a deliberate,
// reviewed act — the whole point of a seam test is that the surface can't grow
// by accident (a stray `export *` or a new re-export fails the set equality).
const ALLOWED_TYPES = [
  "ApiModel",
  "ApiNav",
  "ApiNavItem",
  "ApiNodeKind",
  "ApiPageProps",
  "ApiOperationPage",
  "ApiSchemaPage",
  "ApiSectionPage",
  "ApiRootPage",
  "ApiFieldView",
  "ApiTypeShape",
  "ApiScalarView",
  "ApiUnionView",
  "ApiVariant",
  "ApiDiscriminatorEntry",
  "ApiParamGroup",
  "ApiAuthView",
  "ApiCodeSampleView",
  "ApiExampleView",
  "ApiResponseView",
  "ApiBreadcrumb",
  "ApiRef",
  "ApiConstraint",
  "ApiPageIndexEntry",
  "JsonValue",
  "SpecSource",
  "Diagnostic",
];

const RUNTIME_EXPORTS = [
  "ApiBuildError",
  "apiSchemaVersion",
  "buildApiModel",
  "clearApiModelCache",
  "getApiFieldCitations",
  "getApiModel",
  "getApiNav",
  "getApiPageIndex",
  "getApiPageProps",
  "getApiPageSlugs",
  "renderApiPageMarkdown",
];

function seamExports(): { checker: ts.TypeChecker; symbols: ts.Symbol[] } {
  const configPath = ts.findConfigFile(PKG_ROOT, ts.sys.fileExists, "tsconfig.json");
  assert.ok(configPath, "the package tsconfig resolves");
  const parsed = ts.parseJsonConfigFileContent(
    ts.readConfigFile(configPath, ts.sys.readFile).config,
    ts.sys,
    dirname(configPath),
  );
  const program = ts.createProgram([ENTRY], { ...parsed.options, noEmit: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(ENTRY);
  assert.ok(source, "the seam source is in the program");
  const moduleSymbol = checker.getSymbolAtLocation(source);
  assert.ok(moduleSymbol, "the seam is a module with an export table");
  return { checker, symbols: checker.getExportsOfModule(moduleSymbol) };
}

// Resolve an export to its ORIGINAL declaration, following alias chains — so a
// renamed re-export reports where the symbol truly lives, not the seam alias.
function originDeclaration(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Declaration | undefined {
  let target = symbol;
  while (target.flags & ts.SymbolFlags.Alias) {
    const next = checker.getAliasedSymbol(target);
    if (next === target) break;
    target = next;
  }
  return target.getDeclarations()?.[0];
}

describe("api seam purity", () => {
  test("the exported surface is exactly the documented runtime + type allowlist", () => {
    const { symbols } = seamExports();
    const actual = symbols.map((s) => s.getName()).sort();
    const expected = [...new Set([...RUNTIME_EXPORTS, ...ALLOWED_TYPES])].sort();
    assert.deepEqual(actual, expected);
  });

  test("no exported symbol originates from the spine IR (model.ts)", () => {
    // model.ts is the sole home of DocsModel/Node/NodeKind/*Facts, so a single
    // origin rule forbids the entire IR — and resolving through aliases means
    // `export type { Node as ApiNodeKind }` is caught by WHERE Node is declared,
    // not by the name it's re-exported under.
    const { checker, symbols } = seamExports();
    for (const symbol of symbols) {
      const decl = originDeclaration(checker, symbol);
      const file = decl?.getSourceFile().fileName ?? "";
      assert.ok(
        !/[/\\]_internal[/\\]api[/\\]model\.ts$/.test(file),
        `"${symbol.getName()}" resolves into the spine IR (${file}) — the seam must expose only the view-model`,
      );
    }
  });

  test("runtime exports are exactly the frozen surface", () => {
    assert.deepEqual(Object.keys(api).sort(), [...RUNTIME_EXPORTS].sort());
  });

  test("apiSchemaVersion is frozen at 1", () => {
    assert.equal(api.apiSchemaVersion, 1);
  });
});
