/**
 * The **structure** category: would the site build, and would every route and
 * MDX tag resolve? Runs the *same* validators the build gates on — early and
 * build-free, so `check` and `astro build` never disagree:
 *   - config Zod       → `validateNimbusConfig`
 *   - duplicate routes → `findDuplicateRoutes`
 *   - MDX components   → `validateMdxContent`
 * Internal-link resolution is left to the authoring `nimbus/internal-link`
 * rule (one implementation), not duplicated here.
 */

import path from "node:path";
import { existsSync } from "node:fs";

import type { ConfigParseResult } from "../_internal/parse-nimbus-config.js";
import {
  parseCollectionBases,
  parseContentCollections,
  filterIndexableCollections,
} from "../_internal/parse-content-collections.js";
import { parseComponentsRegistry } from "../_internal/parse-components-registry.js";
import { validateMdxContent } from "../_internal/validate-mdx-content.js";
import { validateNimbusConfig } from "../_internal/validate.js";
import {
  contentEntryUrl,
  enumerateEntriesByBase,
  enumerateStaticPageRoutes,
  findDuplicateRoutes,
  type RouteOwner,
} from "../lint/site-model.js";
import type { CheckFinding } from "./finding.js";
import { lineOf, relFile } from "./loc.js";

export async function checkStructure(
  cwd: string,
  parsed: ConfigParseResult,
): Promise<CheckFinding[]> {
  const findings: CheckFinding[] = [];

  checkConfigZod(findings, parsed);
  await checkDuplicateRoutes(cwd, findings, parsed);
  await checkMdxComponents(cwd, findings);

  return findings;
}

function checkConfigZod(
  findings: CheckFinding[],
  parsed: ConfigParseResult,
): void {
  if (!parsed.ok) return; // env already reported the file-level failure

  const file = relFile(parsed.location.file);
  const line = lineOf(parsed.location.source, parsed.location.objectStart);

  // A partially-dynamic config can't be fully Zod-validated statically: warn
  // about what's unresolved and defer that verdict to a build.
  const hasSpread = parsed.unresolved.includes("...spread");
  if (parsed.unresolved.length > 0) {
    const fields = parsed.unresolved
      .map((u) => (u === "...spread" ? "a spread (`...`)" : `\`${u}\``))
      .join(", ");
    findings.push({
      scope: "structure",
      code: "nimbus/config-unresolved",
      severity: "warn",
      file,
      line,
      message:
        `Config has computed field(s) this build-free check can't evaluate: ${fields}. ` +
        `Run a build for full config validation.`,
      fixable: false,
    });
  }

  // Validate the fields we can see even in a mixed config. Inject a valid
  // placeholder for any required field (site/title) that's unresolved or maybe
  // spread-supplied — so we don't spuriously error on the omission while still
  // catching a genuinely-invalid literal (AC#4 stays honest for mixed configs).
  const probe: Record<string, unknown> = { ...parsed.config };
  if (probe.site === undefined && (hasSpread || parsed.unresolved.includes("site"))) {
    probe.site = "https://nimbus.placeholder.invalid";
  }
  if (probe.title === undefined && (hasSpread || parsed.unresolved.includes("title"))) {
    probe.title = "placeholder";
  }

  try {
    validateNimbusConfig(probe);
  } catch (err) {
    findings.push({
      scope: "structure",
      code: "nimbus/config-invalid",
      severity: "error",
      file,
      line,
      message: err instanceof Error ? err.message : String(err),
      fixable: false,
    });
  }
}

async function checkDuplicateRoutes(
  cwd: string,
  findings: CheckFinding[],
  parsed: ConfigParseResult,
): Promise<void> {
  const srcDir = path.join(cwd, "src");
  const contentRoot = path.join(srcDir, "content");
  if (!existsSync(contentRoot)) return; // no content yet — nothing to collide

  const contentConfigPath = path.join(srcDir, "content.config.ts");
  const rawCollections = await parseContentCollections(contentConfigPath);
  const collectionBases = await parseCollectionBases(contentConfigPath);
  const indexedCollections =
    rawCollections === null ? ["docs"] : filterIndexableCollections(rawCollections);
  const indexedSet = new Set(indexedCollections);

  const versions =
    parsed.ok && isVersionsObject(parsed.config.versions)
      ? { others: asStringArray(parsed.config.versions.others) }
      : null;

  const indexedBases = new Map<string, string>();
  if (collectionBases !== null) {
    for (const [key, base] of collectionBases) {
      if (indexedSet.has(key)) indexedBases.set(key, base);
    }
  } else {
    for (const key of indexedCollections) indexedBases.set(key, key);
  }

  const contentOwners: RouteOwner[] = enumerateEntriesByBase(
    contentRoot,
    indexedBases,
  ).map((entry) => ({
    url: contentEntryUrl(entry, versions),
    source: `src/content/${entry.relPath}`,
    kind: "content" as const,
  }));

  const pagesRoot = path.join(srcDir, "pages");
  const pageOwners: RouteOwner[] = existsSync(pagesRoot)
    ? enumerateStaticPageRoutes(pagesRoot, cwd).map((r) => ({
        ...r,
        kind: "page" as const,
      }))
    : [];

  const dups = findDuplicateRoutes([...contentOwners, ...pageOwners]);
  for (const d of dups) {
    if (d.shadowedByPage) {
      findings.push({
        scope: "structure",
        code: "nimbus/duplicate-slug",
        severity: "warn",
        message: `${d.url} is served by a src/pages file that shadows a content entry (${d.sources.join(", ")}). Verify the shadow is intentional.`,
        fixable: false,
      });
    } else {
      findings.push({
        scope: "structure",
        code: "nimbus/duplicate-slug",
        severity: "error",
        message: `${d.url} is claimed by more than one source (${d.sources.join(", ")}) — one would shadow the other. Rename or move one.`,
        fixable: false,
      });
    }
  }
}

async function checkMdxComponents(
  cwd: string,
  findings: CheckFinding[],
): Promise<void> {
  const srcDir = path.join(cwd, "src");
  const contentRoot = path.join(srcDir, "content");
  if (!existsSync(contentRoot)) return;

  const componentsPath = path.join(srcDir, "components.ts");
  const globals = await parseComponentsRegistry(componentsPath);
  if (globals === null) {
    findings.push({
      scope: "structure",
      code: "nimbus/components-registry-missing",
      severity: "warn",
      file: "src/components.ts",
      message:
        "src/components.ts is missing or doesn't export a parseable `components` object — MDX component resolution can't be checked. Create it with `export const components = { … };`.",
      fixable: false,
    });
    return;
  }

  const failures = await validateMdxContent({
    globals,
    contentDirs: [contentRoot],
    projectRoot: cwd,
  });
  for (const f of failures) {
    findings.push({
      scope: "structure",
      code: "nimbus/component-pascalcase",
      severity: "error",
      file: f.filePath.replace(/\\/g, "/"),
      line: f.line,
      column: f.column,
      message: `<${f.tag} /> is not a registered global or imported in this file — MDX renders it as literal text.`,
      fixable: false,
      ...(f.hint
        ? { fix: { kind: "suggestion", suggestion: `did you mean <${f.hint} />?` } }
        : {}),
    });
  }
}

function isVersionsObject(v: unknown): v is { others?: unknown } {
  return typeof v === "object" && v !== null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
