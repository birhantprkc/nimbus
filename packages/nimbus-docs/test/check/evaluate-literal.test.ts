import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateLiteral } from "../../src/_internal/parse-nimbus-config.js";

function value(text: string): unknown {
  const r = evaluateLiteral(text);
  assert.ok(r.ok, `expected ok for ${text}`);
  return r.value;
}

function unresolved(text: string): void {
  assert.equal(evaluateLiteral(text).ok, false, `expected unresolved for ${text}`);
}

test("primitives", () => {
  assert.equal(value("true"), true);
  assert.equal(value("false"), false);
  assert.equal(value("null"), null);
  assert.equal(value("42"), 42);
  assert.equal(value("-3.5"), -3.5);
  assert.equal(value("1e3"), 1000);
});

test("strings across all quote styles", () => {
  assert.equal(value(`"a"`), "a");
  assert.equal(value(`'b'`), "b");
  assert.equal(value("`c`"), "c");
});

test("known escapes resolve", () => {
  assert.equal(value(`"a\\nb"`), "a\nb");
  assert.equal(value(`"a\\tb"`), "a\tb");
  assert.equal(value(`"a\\\\b"`), "a\\b");
});

test("unknown escapes are unresolved, never guessed", () => {
  unresolved(`"\\u0041"`);
  unresolved(`"\\x41"`);
});

test("template interpolation is unresolved", () => {
  unresolved("`https://${host}`");
});

test("identifiers, calls, undefined are unresolved", () => {
  unresolved("base");
  unresolved("build()");
  unresolved("undefined");
  unresolved(`"a" + "b"`);
});

test("arrays and objects resolve only when fully literal", () => {
  assert.deepEqual(value(`["a", 1, true]`), ["a", 1, true]);
  assert.deepEqual(value(`{ a: 1, "b": "x" }`), { a: 1, b: "x" });
  unresolved(`[a, 1]`);
  unresolved(`{ ...base }`);
});
