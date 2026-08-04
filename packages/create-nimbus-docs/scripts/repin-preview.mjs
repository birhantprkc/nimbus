#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DEP_FIELDS = ["dependencies", "devDependencies", "peerDependencies"];
const NIMBUS_DOCS = "@cloudflare/nimbus-docs";
// Coupled to preview-release.yml's `pkg-pr-new publish --compact` URL shape.

export function repinPreview(templatesDir, pr) {
  const normalizedPr = validatePr(pr);
  const previewUrl = `https://pkg.pr.new/${NIMBUS_DOCS}@${normalizedPr}`;

  for (const entry of readdirSync(templatesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgPath = join(templatesDir, entry.name, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    let rewritten = false;

    for (const field of DEP_FIELDS) {
      if (pkg[field]?.[NIMBUS_DOCS]) {
        pkg[field][NIMBUS_DOCS] = previewUrl;
        rewritten = true;
      }
    }

    if (!rewritten) {
      throw new Error(`${entry.name}/package.json does not depend on ${NIMBUS_DOCS}.`);
    }

    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function validatePr(pr) {
  const value = String(pr ?? "");
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("PR number must be a positive integer.");
  }
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const [templatesDir, pr] = process.argv.slice(2);
    if (!templatesDir) throw new Error("Usage: repin-preview.mjs <templatesDir> <pr>");
    repinPreview(templatesDir, pr);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
