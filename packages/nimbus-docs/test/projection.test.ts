import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PUBLIC_AUDIENCE,
  audienceCacheKey,
  resolveAudience,
} from "../src/_internal/projection.js";
import { validateNimbusConfig } from "../src/_internal/validate.js";

test("resolveAudience defaults to public", () => {
  assert.equal(resolveAudience().key, "public");
  assert.equal(resolveAudience({}).key, "public");
  assert.equal(resolveAudience({ audience: { key: "editor" } }).key, "editor");
});

test("public audience sentinel is immutable", () => {
  assert.equal(Object.isFrozen(PUBLIC_AUDIENCE), true);
});

test("audience cache key includes groups independent of order", () => {
  assert.equal(
    audienceCacheKey({ key: "member", groups: ["b", "a"] }),
    audienceCacheKey({ key: "member", groups: ["a", "b"] }),
  );
  assert.notEqual(
    audienceCacheKey({ key: "member", groups: ["a"] }),
    audienceCacheKey({ key: "member", groups: ["b"] }),
  );
  // Injective across the group/key boundary — a group containing a comma must
  // not collide with two comma-free groups.
  assert.notEqual(
    audienceCacheKey({ key: "m", groups: ["a,b"] }),
    audienceCacheKey({ key: "m", groups: ["a", "b"] }),
  );
  assert.notEqual(
    audienceCacheKey({ key: "a", groups: ["b"] }),
    audienceCacheKey({ key: "a::", groups: ["b"] }),
  );
});

test("removed gated config fails with migration guidance", () => {
  assert.throws(
    () =>
      validateNimbusConfig({
        site: "https://example.com",
        title: "Docs",
        gated: ["internal/**"],
      }),
    /move it out of a routed content collection/,
  );
});
