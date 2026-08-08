import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PUBLIC_AUDIENCE,
  audienceCacheKey,
  clearProjectionCache,
  isGatedFor,
  projectEntriesWith,
  resolveAudience,
} from "../src/_internal/projection.js";
import type { NimbusConfig } from "../src/types.js";

function config(gated?: string[]): NimbusConfig {
  return { site: "https://example.com", title: "T", gated } as NimbusConfig;
}

type Entry = { id: string };
const entries = (...ids: string[]): Entry[] => ids.map((id) => ({ id }));
const idsOf = (list: Entry[]) => list.map((e) => e.id);

test("no gated globs → every entry is public (returns a copy)", () => {
  clearProjectionCache();
  const input = entries("a", "b/c", "d");
  const out = projectEntriesWith(input, (e) => e.id, config());
  assert.deepEqual(idsOf(out), ["a", "b/c", "d"]);
  assert.notEqual(out, input, "must not return the same array reference");
});

test("empty gated array behaves like absent", () => {
  clearProjectionCache();
  const out = projectEntriesWith(entries("a", "b"), (e) => e.id, config([]));
  assert.deepEqual(idsOf(out), ["a", "b"]);
});

test("`internal/**` excludes the whole subtree, keeps the rest", () => {
  clearProjectionCache();
  const input = entries("guide/intro", "internal/secrets", "internal/a/b", "api/x");
  const out = projectEntriesWith(input, (e) => e.id, config(["internal/**"]));
  assert.deepEqual(idsOf(out), ["guide/intro", "api/x"]);
});

test("gates a loader-generated id with NO on-disk path (AC#5)", () => {
  clearProjectionCache();
  // Remote entries have opaque ids and no filesystem path; gating is by id.
  const input = entries("partners/acme/onboarding", "public/welcome");
  const out = projectEntriesWith(input, (e) => e.id, config(["partners/**"]));
  assert.deepEqual(idsOf(out), ["public/welcome"]);
});

test("single-segment wildcard does not cross a slash", () => {
  clearProjectionCache();
  const input = entries("secret", "secret/child", "other");
  const out = projectEntriesWith(input, (e) => e.id, config(["*"]));
  // `*` matches `secret` and `other` but not `secret/child`.
  assert.deepEqual(idsOf(out).sort(), ["secret/child"]);
});

test("suffix glob like `*-draft` matches within a segment", () => {
  clearProjectionCache();
  const input = entries("post-draft", "post", "blog/x-draft");
  const out = projectEntriesWith(input, (e) => e.id, config(["**/*-draft", "*-draft"]));
  assert.deepEqual(idsOf(out), ["post"]);
});

test("normalizes a leading slash / ./ before matching", () => {
  clearProjectionCache();
  assert.equal(isGatedFor("/internal/x", ["internal/**"], PUBLIC_AUDIENCE), true);
  clearProjectionCache();
  assert.equal(isGatedFor("./internal/x", ["internal/**"], PUBLIC_AUDIENCE), true);
});

test("exact-id glob gates only that id", () => {
  clearProjectionCache();
  const input = entries("api/secret", "api/secretly", "api/public");
  const out = projectEntriesWith(input, (e) => e.id, config(["api/secret"]));
  assert.deepEqual(idsOf(out), ["api/secretly", "api/public"]);
});

test("switching glob sets recomputes the memoized matcher", () => {
  clearProjectionCache();
  assert.equal(isGatedFor("a/x", ["a/**"], PUBLIC_AUDIENCE), true);
  // Different glob set on the next call must not reuse the stale matcher.
  assert.equal(isGatedFor("a/x", ["b/**"], PUBLIC_AUDIENCE), false);
  assert.equal(isGatedFor("b/x", ["b/**"], PUBLIC_AUDIENCE), true);
});

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

test("v1 is public-only: a non-public audience still sees the public floor", () => {
  clearProjectionCache();
  const input = entries("internal/x", "pub");
  const out = projectEntriesWith(input, (e) => e.id, config(["internal/**"]), {
    audience: { key: "editor", groups: ["internal"] },
  });
  // Group membership isn't honored yet (BG-1a foundation); the seam exists but
  // gated stays gated for every audience.
  assert.deepEqual(idsOf(out), ["pub"]);
});
