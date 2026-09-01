import { test } from "node:test";
import assert from "node:assert/strict";

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

const serialize = (obj: unknown) => JSON.stringify(obj);

test("builds a cross-version alternates table covering every scanned slug", () => {
  const scanned: VersionEntryInput[] = [
    { collection: "docs", id: "guide" },
    { collection: "docs", id: "plan" },
    { collection: "docs-v1", id: "guide" },
    { collection: "docs-v1", id: "plan" },
  ];
  const table = buildVersionAlternates(versions, scanned);

  assert.ok(table["docs:guide"], "current-version page is linked");
  const blob = serialize(table);
  assert.match(blob, /plan/, "every scanned slug is represented");
});

test("previousSlug maps a renamed page to its old-version slug as an alternate", () => {
  const scanned: VersionEntryInput[] = [
    { collection: "docs", id: "guide", previousSlug: "old-guide" },
    { collection: "docs-v1", id: "old-guide" },
  ];
  const table = buildVersionAlternates(versions, scanned);

  const record = table["docs:guide"];
  assert.ok(record);
  assert.ok(
    record.alternates.some((a) => a.slug === "old-guide"),
    "the renamed page links to its previous-version slug",
  );
});

test("emits a cross-version redirect for a page missing in an older version", () => {
  const scanned: VersionEntryInput[] = [{ collection: "docs", id: "guide" }];
  const table = buildVersionAlternates(versions, scanned);
  const redirects = computeMissingPageRedirects(versions, table, scanned);

  assert.ok(
    redirects.some((r) => r.from === "/v1/guide/"),
    "a page absent from v1 redirects to its current-version URL",
  );
});
