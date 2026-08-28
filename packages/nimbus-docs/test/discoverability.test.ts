// The `noindex` visibility contract shared by every discovery surface.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { isDiscoverable } from "../src/_internal/discoverability.ts";

describe("isDiscoverable", () => {
  test("noindex: true opts a page out of discovery surfaces", () => {
    assert.equal(isDiscoverable({ data: { noindex: true } }), false);
  });

  test("noindex: false is discoverable", () => {
    assert.equal(isDiscoverable({ data: { noindex: false } }), true);
  });

  test("absent noindex defaults to discoverable", () => {
    assert.equal(isDiscoverable({ data: { title: "Guide" } }), true);
    assert.equal(isDiscoverable({ data: {} }), true);
    assert.equal(isDiscoverable({}), true);
  });

  test("only the literal boolean true opts out (schema-tolerant)", () => {
    assert.equal(isDiscoverable({ data: { noindex: "true" } }), true);
    assert.equal(isDiscoverable({ data: { noindex: 1 } }), true);
  });
});
