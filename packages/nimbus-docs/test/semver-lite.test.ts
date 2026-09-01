import assert from "node:assert/strict";
import { test } from "node:test";

import { isRangeSubset, satisfies } from "../src/_internal/semver-lite.js";

test("compound range matches the cloudflare recipe pin", () => {
  assert.equal(satisfies("14.1.0", ">=14.1.0 <14.2.0"), true);
  assert.equal(satisfies("14.1.9", ">=14.1.0 <14.2.0"), true);
  assert.equal(satisfies("14.2.0", ">=14.1.0 <14.2.0"), false, "the ceiling is exclusive");
  assert.equal(satisfies("14.0.9", ">=14.1.0 <14.2.0"), false);
  assert.equal(satisfies("15.0.0", ">=14.1.0 <14.2.0"), false);
});

test("caret major ranges (vercel ^11 / netlify ^8 / blobs ^9)", () => {
  assert.equal(satisfies("11.0.0", "^11"), true);
  assert.equal(satisfies("11.9.4", "^11"), true);
  assert.equal(satisfies("12.0.0", "^11"), false);
  assert.equal(satisfies("10.9.9", "^11"), false);
  assert.equal(satisfies("8.3.1", "^8"), true);
  assert.equal(satisfies("9.0.0", "^8"), false);
});

test("caret on 0.x locks the minor", () => {
  assert.equal(satisfies("0.5.9", "^0.5.2"), true);
  assert.equal(satisfies("0.6.0", "^0.5.2"), false);
  assert.equal(satisfies("0.5.1", "^0.5.2"), false);
});

test("fails open on anything it can't parse (never a false warning)", () => {
  assert.equal(satisfies("14.2.0", "workspace:*"), true);
  assert.equal(satisfies("next", ">=1.0.0"), true);
  assert.equal(satisfies("14.2.0", ""), true);
});

test("uses npm prerelease semantics", () => {
  assert.equal(satisfies("11.0.0-beta.1", "^11"), false);
});

test("proves a declared range stays inside the recipe range", () => {
  assert.equal(isRangeSubset("^11.0.0", "^11"), true);
  assert.equal(isRangeSubset(">=11.0.0 <11.1.2", ">=11.0.0 <11.1.3"), true);
  assert.equal(isRangeSubset("^11", ">=11.0.0 <11.1.3"), false);
  assert.equal(isRangeSubset("workspace:*", "^11"), false);
});
