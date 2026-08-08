import { test } from "node:test";
import assert from "node:assert/strict";

import { isGatedFor, PUBLIC_AUDIENCE } from "../src/_internal/projection.js";
import {
  buildVersionAlternates,
  computeMissingPageRedirects,
  type VersionEntryInput,
} from "../src/_internal/version-alternates.js";
import type { ResolvedVersions } from "../src/types.js";

const versions: ResolvedVersions = {
  current: "v2",
  others: ["v1"],
  deprecated: [],
  hidden: [],
  all: ["v2", "v1"],
};

function gate(entries: VersionEntryInput[], globs: string[]): VersionEntryInput[] {
  return entries.filter((e) => !isGatedFor(e.id, globs, PUBLIC_AUDIENCE));
}

const serialize = (obj: unknown) => JSON.stringify(obj);

test("gated slug never reaches the alternates table, canonical, or serialized output", () => {
  const scanned: VersionEntryInput[] = [
    { collection: "docs", id: "guide" },
    { collection: "docs", id: "secret/plan" },
    { collection: "docs-v1", id: "guide" },
    { collection: "docs-v1", id: "secret/plan" },
  ];
  const entries = gate(scanned, ["secret/**"]);
  const table = buildVersionAlternates(versions, entries);

  const blob = serialize(table);
  assert.doesNotMatch(blob, /secret\/plan/);
  assert.doesNotMatch(blob, /\/v1\/secret/);
  assert.ok(table["docs:guide"], "public page is still linked");
});

test("previousSlug rename into a gated old-version slug does not leak into a public head", () => {
  const scanned: VersionEntryInput[] = [
    { collection: "docs", id: "guide", previousSlug: "secret/old-guide" },
    { collection: "docs-v1", id: "secret/old-guide" },
  ];
  const entries = gate(scanned, ["secret/**"]);
  const table = buildVersionAlternates(versions, entries);

  const record = table["docs:guide"];
  assert.ok(record);
  assert.deepEqual(
    record.alternates.filter((a) => a.slug.startsWith("secret/")),
    [],
    "no gated sibling may appear as an alternate on the public page",
  );
});

test("gated current-version slug emits no cross-version redirect", () => {
  const scanned: VersionEntryInput[] = [
    { collection: "docs", id: "secret/plan" },
    { collection: "docs", id: "guide" },
  ];
  const entries = gate(scanned, ["secret/**"]);
  const table = buildVersionAlternates(versions, entries);
  const redirects = computeMissingPageRedirects(versions, table, entries);

  assert.doesNotMatch(serialize(redirects), /secret\/plan/);
  assert.ok(
    redirects.some((r) => r.from === "/v1/guide/"),
    "public missing-page redirect is still emitted",
  );
});
