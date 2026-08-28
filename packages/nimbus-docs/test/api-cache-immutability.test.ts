// Regression guards for two robustness fixes on the `./api` seam:
//   1. The build cache is keyed by a collision-resistant digest (SHA-256), so
//      two DIFFERENT specs never alias to one cached model.
//   2. The cached nav base is deep-frozen, so a consumer mutating the returned
//      nav can't poison every later `getApiNav` call.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildApiModel,
  getApiNav,
  getApiPageSlugs,
  clearApiModelCache,
} from "../src/api/index.js";

const specA = `
openapi: 3.1.0
info: { title: A, version: "1" }
paths:
  /alpha:
    get:
      operationId: getAlpha
      responses:
        "200": { description: ok }
`;

const specB = `
openapi: 3.1.0
info: { title: B, version: "1" }
paths:
  /beta:
    get:
      operationId: getBeta
      responses:
        "200": { description: ok }
`;

describe("api build cache: collision-resistant key", () => {
  test("two DIFFERENT specs on one collection do not alias", async () => {
    clearApiModelCache("cache-distinct");

    const a = await buildApiModel({ collection: "cache-distinct", spec: specA });
    const b = await buildApiModel({ collection: "cache-distinct", spec: specB });

    const slugsA = getApiPageSlugs(a)
      .map((s) => s.slug)
      .sort();
    const slugsB = getApiPageSlugs(b)
      .map((s) => s.slug)
      .sort();

    assert.notDeepEqual(
      slugsA,
      slugsB,
      "the second build must not return the first spec's cached model",
    );
    assert.ok(
      slugsA.includes("getAlpha"),
      "spec A resolves its own operation",
    );
    assert.ok(
      slugsB.includes("getBeta"),
      "spec B resolves its own operation",
    );
  });

  test("building the SAME bytes twice returns consistent slugs", async () => {
    clearApiModelCache("cache-same");

    const first = await buildApiModel({ collection: "cache-same", spec: specA });
    const second = await buildApiModel({ collection: "cache-same", spec: specA });

    assert.deepEqual(getApiPageSlugs(first), getApiPageSlugs(second));
  });
});

describe("api nav: cached base is immutable", () => {
  test("mutating a returned nav item cannot poison later reads", async () => {
    clearApiModelCache("nav-frozen");

    const model = await buildApiModel({
      collection: "nav-frozen",
      spec: specA,
    });

    const nav = getApiNav(model);
    assert.ok(nav.items.length > 0, "nav has at least one root item");
    const original = nav.items[0].label;

    // Frozen data: the write either throws (strict mode) or is a silent no-op.
    // Either way the cached base must survive uncorrupted.
    try {
      nav.items[0].label = "POISON";
    } catch {
      /* frozen — expected in strict mode */
    }

    const reread = getApiNav(model).items[0].label;
    assert.equal(
      reread,
      original,
      "a later getApiNav read must not see the poisoned label",
    );
    assert.notEqual(reread, "POISON");
  });
});
