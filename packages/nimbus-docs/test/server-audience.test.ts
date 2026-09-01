import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUBLIC_AUDIENCE,
  getAudience,
  resolveAudience,
  type Audience,
} from "../src/server.js";

test("getAudience defaults to the public floor when nothing set it", () => {
  assert.equal(getAudience().key, "public");
  assert.equal(getAudience({}).key, "public");
  assert.equal(getAudience({ nimbus: {} }).key, "public");
  assert.equal(getAudience(undefined), PUBLIC_AUDIENCE);
});

test("getAudience returns the middleware-provided audience verbatim", () => {
  const editor: Audience = { key: "editor", groups: ["internal"] };
  const out = getAudience({ nimbus: { audience: editor } });
  assert.equal(out, editor);
  assert.deepEqual(out.groups, ["internal"]);
});

test("resolveAudience is re-exported and agrees with the public floor", () => {
  assert.equal(resolveAudience().key, "public");
  assert.equal(resolveAudience({ audience: { key: "preview" } }).key, "preview");
});
