import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { MIGRATION_CATALOG } from "../src/_internal/migrations.js";
import {
  installedNimbusVersion,
  resolveUpgradeBaseline,
  runningNimbusVersion,
  selectUpgradeEntries,
  UPGRADE_MANIFEST,
} from "../src/_internal/upgrades.js";

test("source execution reads the current package version", () => {
  const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(runningNimbusVersion(), packageJson.version);
});

test("every automatic manifest entry has a matching codemod", () => {
  const automatic = UPGRADE_MANIFEST.entries.filter((entry) => entry.mode === "automatic");
  assert.deepEqual(
    automatic.map((entry) => [entry.migrationId, entry.introducedIn]).sort(),
    MIGRATION_CATALOG.map((entry) => [entry.id, entry.introducedIn]).sort(),
  );
});

test("selectUpgradeEntries composes the open-closed version range", () => {
  assert.deepEqual(
    selectUpgradeEntries("0.11.0", "0.12.9").map((entry) => entry.id),
    ["remove-gated-config"],
  );
  assert.deepEqual(
    selectUpgradeEntries("0.11.0", "0.13.0").map((entry) => entry.id),
    [
      "remove-gated-config",
      "index-route-normalization",
      "llms-full-prepared-artifact",
      "logical-authored-links",
      "partial-resolver-to-markdown",
      "prepared-markdown-artifacts",
      "prepared-publication-api-renames",
      "twins-config-to-markdown",
      "with-base-route-to-with-base",
    ],
  );
  assert.equal(selectUpgradeEntries("0.13.0", "0.13.1").length, 0);
});

test("selectUpgradeEntries rejects unsupported and reversed ranges", () => {
  assert.throws(() => selectUpgradeEntries("0.10.0", "0.13.1"), /predates the complete manifest/);
  assert.throws(() => selectUpgradeEntries("0.14.0", "0.13.1"), /newer than installed/);
  assert.throws(() => selectUpgradeEntries("next", "0.13.1"), /Invalid upgrade baseline/);
});

test("resolveUpgradeBaseline prefers --from and validates persisted baselines", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-upgrades-"));
  try {
    fs.writeFileSync(path.join(root, "nimbus.json"), JSON.stringify({ lastReviewedNimbusVersion: "0.12.0" }));
    assert.deepEqual(resolveUpgradeBaseline({ projectRoot: root, targetVersion: "0.13.1" }), {
      fromVersion: "0.12.0",
      targetVersion: "0.13.1",
      source: "nimbus-json",
    });
    assert.deepEqual(resolveUpgradeBaseline({ projectRoot: root, fromVersion: "0.13.0", targetVersion: "0.13.1" }), {
      fromVersion: "0.13.0",
      targetVersion: "0.13.1",
      source: "argument",
      error: "--from 0.13.0 does not match the recorded Nimbus baseline 0.12.0.",
    });
    assert.equal(resolveUpgradeBaseline({ projectRoot: root, fromVersion: "0.12.0", targetVersion: "0.13.1" }).error, undefined);

    fs.writeFileSync(path.join(root, "nimbus.json"), JSON.stringify({ lastReviewedNimbusVersion: "0.10.0" }));
    assert.match(resolveUpgradeBaseline({ projectRoot: root, targetVersion: "0.13.1" }).error ?? "", /oldest supported baseline/);

    fs.writeFileSync(path.join(root, "nimbus.json"), JSON.stringify({ lastReviewedNimbusVersion: null }));
    assert.equal(resolveUpgradeBaseline({ projectRoot: root, targetVersion: "0.13.1" }).source, "nimbus-json");
    fs.writeFileSync(path.join(root, "nimbus.json"), JSON.stringify({ preview: { pr: 123 } }));
    assert.equal(resolveUpgradeBaseline({ projectRoot: root, targetVersion: "0.13.1" }).source, "nimbus-json");
    fs.writeFileSync(
      path.join(root, "package.json"),
      JSON.stringify({ dependencies: { "@cloudflare/nimbus-docs": "https://pkg.pr.new/@cloudflare/nimbus-docs@123" } }),
    );
    assert.equal(resolveUpgradeBaseline({ projectRoot: root, targetVersion: "0.13.1" }).source, "preview");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("malformed nimbus.json guidance names the file and recovery command", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-upgrades-malformed-"));
  try {
    fs.writeFileSync(path.join(root, "nimbus.json"), "{");
    for (const result of [
      resolveUpgradeBaseline({ projectRoot: root, targetVersion: "0.13.1" }),
      resolveUpgradeBaseline({ projectRoot: root, fromVersion: "0.12.0", targetVersion: "0.13.1" }),
    ]) {
      assert.match(result.error ?? "", /Could not read nimbus\.json/);
      assert.match(result.error ?? "", /nimbus-docs init --force/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("installedNimbusVersion finds an installed project or workspace package", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-installed-version-"));
  try {
    const project = path.join(root, "packages", "docs");
    fs.mkdirSync(path.join(root, "node_modules", "@cloudflare", "nimbus-docs"), { recursive: true });
    fs.mkdirSync(project, { recursive: true });
    fs.writeFileSync(
      path.join(root, "node_modules", "@cloudflare", "nimbus-docs", "package.json"),
      JSON.stringify({ version: "0.12.0" }),
    );
    assert.equal(installedNimbusVersion(project), "0.12.0");
    assert.match(
      resolveUpgradeBaseline({ projectRoot: project }).error ?? "",
      new RegExp(`executing Nimbus CLI is ${runningNimbusVersion().replaceAll(".", "\\.")}`),
    );
    fs.writeFileSync(
      path.join(root, "node_modules", "@cloudflare", "nimbus-docs", "package.json"),
      JSON.stringify({ version: "not-semver" }),
    );
    assert.throws(() => installedNimbusVersion(project), /invalid version/);
    assert.match(resolveUpgradeBaseline({ projectRoot: project }).error ?? "", /installed Nimbus package metadata/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
