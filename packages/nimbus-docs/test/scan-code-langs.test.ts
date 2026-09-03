/**
 * The code-block scanner feeds Shiki's eager-loaded languages and generated CSS.
 * Shiki throws on grammars it can't resolve, so the scanner must (1) not mistake
 * inline `` ```x``` `` for a fenced block, and (2) drop unknown languages —
 * unknown code renders as plaintext (like Expressive Code), never a build crash.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  scanCodeBlockLanguages,
  scanCodeBlocks,
} from "../src/_internal/scan-code-langs.js";

async function scan(body: string, langAlias?: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-scanlang-"));
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await writeFile(path.join(root, "src/content/a.mdx"), body, "utf8");
  return scanCodeBlockLanguages(root, langAlias);
}

test("ignores inline triple-backtick code (CommonMark: backticks in the info string)", async () => {
  // Line-start triple backticks: the `[^\n`]*$` clause rejects this because a
  // closing backtick follows → inline code, not a fence.
  const langs = await scan("```calendar-notification@google.com``` is the address.\n");
  assert.deepEqual(langs, []);
});

test("ignores inline triple-backtick even when the token is a real language", async () => {
  // Isolates the regex clause from the filter: `js` is known, so the filter
  // would keep it — only the info-string-backtick rejection drops this inline
  // code.
  const langs = await scan("```js``` is shorthand, used inline.\n");
  assert.deepEqual(langs, []);
});

test("collects real fenced languages and drops unknown ones", async () => {
  const langs = await scan(
    "```js\nconst a = 1;\n```\n\n```boguslang\nx\n```\n\n```python\np = 1\n```\n",
  );
  assert.ok(langs.includes("js"), `expected js; got ${JSON.stringify(langs)}`);
  assert.ok(langs.includes("python"));
  assert.ok(!langs.includes("boguslang"));
});

test("keeps a real fence that carries a metadata info string", async () => {
  // Backtick-free metadata (title, line ranges) must not be mistaken for inline.
  const langs = await scan('```js title="x" {1,3}\nconst a = 1;\n```\n');
  assert.deepEqual(langs, ["js"]);
});

test("collects tilde and long backtick fences", async () => {
  const body =
    "~~~js\nconst tilde = true;\n~~~\n\n````python\nlong = True\n`````\n";
  assert.deepEqual(await scan(body), ["js", "python"]);
});

test("requires a matching fence marker at least as long as the opener", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-scanblock-"));
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await writeFile(
    path.join(root, "src/content/a.mdx"),
    "````js\nconst stillOpen = true;\n```\n````\n\n~~~python\nvalue = 1\n```\n~~~\n",
    "utf8",
  );
  assert.deepEqual(await scanCodeBlocks(root), [
    { lang: "js", code: "const stillOpen = true;\n```\n" },
    { lang: "python", code: "value = 1\n```\n" },
  ]);
});

test("collects container and EOF-terminated fences", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-scanblock-"));
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await writeFile(
    path.join(root, "src/content/a.mdx"),
    "> ~~~python\n> quoted = True\n> ~~~\n\n100. item\n\n     ```js\n     listed = true\n     ```\n\n~~~css\n.unclosed {}",
    "utf8",
  );
  assert.deepEqual(await scanCodeBlocks(root), [
    { lang: "python", code: "quoted = True\n" },
    { lang: "js", code: "listed = true\n" },
    { lang: "css", code: ".unclosed {}\n" },
  ]);
});

test("does not detect fence-like text inside an unlabeled outer fence", async () => {
  const body = "```\n~~~js\nnot a real nested block\n~~~\n```\n\n```js{1}\nunknown token\n```\n";
  assert.deepEqual(await scan(body), []);
});

test("normalizes CRLF and de-indents code using CommonMark rules", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-scanblock-"));
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await writeFile(
    path.join(root, "src/content/a.mdx"),
    "  ~~~ts\r\n  const value = true;\r\n  ~~~\r\n",
    "utf8",
  );
  assert.deepEqual(await scanCodeBlocks(root), [
    { lang: "ts", code: "const value = true;\n" },
  ]);
});

test("keeps special languages (text/plaintext) and applies langAlias", async () => {
  const langs = await scan("```text\nplain\n```\n\n```console\n$ ls\n```\n", {
    console: "shellsession",
  });
  assert.ok(langs.includes("text"));
  assert.ok(langs.includes("shellsession"));
  assert.ok(!langs.includes("console"));
});

test("collects source for build-derived request-rendering styles", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-scanblock-"));
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await writeFile(
    path.join(root, "src/content/a.mdx"),
    "```console\n$ nimbus build\n```\n\n```unknown\nnope\n```\n",
    "utf8",
  );
  assert.deepEqual(await scanCodeBlocks(root, { console: "shellsession" }), [
    { lang: "shellsession", code: "$ nimbus build\n" },
  ]);
});

test("scans valid Markdown with HTML comments", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "nimbus-scanblock-"));
  await mkdir(path.join(root, "src/content"), { recursive: true });
  await writeFile(
    path.join(root, "src/content/a.md"),
    "<!-- ```python\nnot a code block\n``` -->\n\n```js\nconst visible = true;\n```\n",
    "utf8",
  );
  assert.deepEqual(await scanCodeBlockLanguages(root), ["js"]);
  assert.deepEqual(await scanCodeBlocks(root), [
    { lang: "js", code: "const visible = true;\n" },
  ]);
});
