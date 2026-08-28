// Citation-index externality. The index (thousands of entries at
// full-spec scale) must never ride into the runtime Worker bundle. The structural
// guarantee — mirroring `api-parser-externality` — is that it lives in its own
// virtual module read only by a dedicated, dynamically-imported loader:
//
//   1. `virtual:nimbus/coordinates` is imported by EXACTLY ONE module,
//      `load-citation-index.ts`, and only via a dynamic `await import` (a split
//      point → its own lazy chunk, not the Worker entry).
//   2. `runtime-config.ts` — whose whole-namespace `virtual:nimbus/config`
//      import Rollup cannot per-export tree-shake — never references it.
//
// If either goes red, the citation index can leak into the runtime bundle.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC_ROOT = fileURLToPath(new URL("../src", import.meta.url));
const COORDINATES_MODULE = "virtual:nimbus/coordinates";

function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = collectTsFiles(SRC_ROOT);

/** An `import … from "id"`, bare `import "id"`, or literal `import("id")`. A
 *  doc-comment mention or a plugin's id literal matches none of these. */
function importsModule(source: string, id: string): boolean {
  const q = id.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return (
    new RegExp(`\\bfrom\\s+["']${q}["']`).test(source) ||
    new RegExp(`\\bimport\\s+["']${q}["']`).test(source) ||
    new RegExp(`\\bimport\\s*\\(\\s*["']${q}["']\\s*\\)`).test(source)
  );
}

describe("citation-index externality", () => {
  test("only load-citation-index.ts imports virtual:nimbus/coordinates", () => {
    const referencing = files.filter((f) => importsModule(readFileSync(f, "utf8"), COORDINATES_MODULE));
    assert.deepEqual(
      referencing.map((f) => f.slice(SRC_ROOT.length)),
      ["/_internal/api/load-citation-index.ts"],
    );
  });

  test("load-citation-index reaches the module only through a dynamic import", () => {
    const src = readFileSync(`${SRC_ROOT}/_internal/api/load-citation-index.ts`, "utf8");
    assert.match(src, /await import\(\s*["']virtual:nimbus\/coordinates["']\s*\)/);
    assert.doesNotMatch(src, /\bfrom\s+["']virtual:nimbus\/coordinates["']/);
  });

  test("runtime-config never references the citation-index module", () => {
    const src = readFileSync(`${SRC_ROOT}/_internal/runtime-config.ts`, "utf8");
    assert.equal(src.includes(COORDINATES_MODULE), false);
  });
});
