import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDotenv, readDotenvVars } from "../src/_internal/dotenv.js";

test("parseDotenv reads KEY=value pairs", () => {
  assert.deepEqual(
    [...parseDotenv("A=1\nB=two")],
    [
      ["A", "1"],
      ["B", "two"],
    ],
  );
});

test("parseDotenv strips matching single/double quotes", () => {
  const out = parseDotenv(`A="quoted"\nB='single'`);
  assert.equal(out.get("A"), "quoted");
  assert.equal(out.get("B"), "single");
});

test("parseDotenv keeps `=` in the value", () => {
  assert.equal(
    parseDotenv("URL=https://x/?a=b&c=d").get("URL"),
    "https://x/?a=b&c=d",
  );
});

test("parseDotenv tolerates CRLF, blank lines, and # comments", () => {
  const out = parseDotenv(
    "# comment\r\n\r\nA=1\r\n  # indented comment\r\nB=2\r\n",
  );
  assert.deepEqual(
    [...out],
    [
      ["A", "1"],
      ["B", "2"],
    ],
  );
});

test("parseDotenv rejects invalid keys and leading-`=` lines", () => {
  const out = parseDotenv("1BAD=x\nkebab-case=y\n=novalue\nGOOD=z");
  assert.deepEqual([...out.keys()], ["GOOD"]);
});

test("parseDotenv treats a lone-quote value as empty after stripping", () => {
  assert.equal(parseDotenv(`A=""`).get("A"), "");
});

function withTmp(
  files: Record<string, string>,
  fn: (dir: string) => void,
): void {
  const dir = mkdtempSync(join(tmpdir(), "nimbus-dotenv-"));
  try {
    for (const [name, body] of Object.entries(files)) {
      writeFileSync(join(dir, name), body);
    }
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("readDotenvVars unions keys across all .env* files", () => {
  withTmp(
    { ".env": "A=1", ".env.production": "B=2", ".env.local": "C=3" },
    (dir) => {
      const out = readDotenvVars(dir);
      assert.equal(out.get("A"), "1");
      assert.equal(out.get("B"), "2");
      assert.equal(out.get("C"), "3");
    },
  );
});

test("readDotenvVars: an empty placeholder in .env never shadows a real value in .env.production", () => {
  withTmp({ ".env": "TOKEN=", ".env.production": "TOKEN=real" }, (dir) => {
    assert.equal(readDotenvVars(dir).get("TOKEN"), "real");
  });
});

test("readDotenvVars: a real value in .env is not clobbered by a later empty entry", () => {
  withTmp({ ".env": "TOKEN=real", ".env.production": "TOKEN=" }, (dir) => {
    assert.equal(readDotenvVars(dir).get("TOKEN"), "real");
  });
});

test("readDotenvVars returns an empty map when no .env* files exist", () => {
  withTmp({}, (dir) => {
    assert.equal(readDotenvVars(dir).size, 0);
  });
});
