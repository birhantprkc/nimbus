// Config validation for `apiReferences[]` — the remote-citation seam. Rules are
// permanent public surface: slug-safe collection, non-empty manifest, http(s)
// origin, unique collections, and no shadowing of a local `api[]` collection.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { validateNimbusConfig } from "../src/_internal/validate.js";

function withConfig(extra: Record<string, unknown>): unknown {
  return { site: "https://example.com", title: "T", ...extra };
}

describe("apiReferences config — accepted", () => {
  test("a URL manifest with an origin", () => {
    assert.doesNotThrow(() =>
      validateNimbusConfig(
        withConfig({
          apiReferences: [
            {
              collection: "billing",
              manifest: "https://api.example.com/nimbus-api/coordinates.json",
              origin: "https://api.example.com",
            },
          ],
        }),
      ),
    );
  });

  test("a local-path manifest with no origin", () => {
    assert.doesNotThrow(() =>
      validateNimbusConfig(
        withConfig({ apiReferences: [{ collection: "billing", manifest: "./vendor/billing.json" }] }),
      ),
    );
  });
});

describe("apiReferences config — rejected", () => {
  test("an uppercase collection", () => {
    assert.throws(
      () =>
        validateNimbusConfig(
          withConfig({ apiReferences: [{ collection: "Billing", manifest: "x.json" }] }),
        ),
      /lowercase letters, digits, and dashes/,
    );
  });

  test("an empty manifest string", () => {
    assert.throws(
      () =>
        validateNimbusConfig(
          withConfig({ apiReferences: [{ collection: "billing", manifest: "" }] }),
        ),
      /manifest/,
    );
  });

  test("an http:// manifest URL (plaintext transport lets the contract be forged)", () => {
    assert.throws(
      () =>
        validateNimbusConfig(
          withConfig({
            apiReferences: [
              { collection: "billing", manifest: "http://api.example.com/nimbus-api/coordinates.json" },
            ],
          }),
        ),
      /manifest.*https|https.*manifest/i,
    );
  });

  test("an https:// manifest URL is accepted", () => {
    assert.doesNotThrow(() =>
      validateNimbusConfig(
        withConfig({
          apiReferences: [
            { collection: "billing", manifest: "https://api.example.com/nimbus-api/coordinates.json" },
          ],
        }),
      ),
    );
  });

  test("a non-http origin", () => {
    assert.throws(
      () =>
        validateNimbusConfig(
          withConfig({
            apiReferences: [{ collection: "billing", manifest: "x.json", origin: "ftp://nope" }],
          }),
        ),
      /origin/,
    );
  });

  test("duplicate reference collections", () => {
    assert.throws(
      () =>
        validateNimbusConfig(
          withConfig({
            apiReferences: [
              { collection: "billing", manifest: "a.json" },
              { collection: "billing", manifest: "b.json" },
            ],
          }),
        ),
      /duplicate apiReferences collection/,
    );
  });

  test("a reference that shadows a local api collection", () => {
    assert.throws(
      () =>
        validateNimbusConfig(
          withConfig({
            api: [{ collection: "billing", spec: "./billing.yaml" }],
            apiReferences: [{ collection: "billing", manifest: "x.json" }],
          }),
        ),
      /collides with a local api collection/,
    );
  });
});
