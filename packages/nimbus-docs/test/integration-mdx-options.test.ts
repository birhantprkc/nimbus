import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveMdxOptions } from "../src/integration.js";

test("MDX optimize is enabled by default", () => {
  assert.deepEqual(resolveMdxOptions(undefined), { optimize: true });
});

test("MDX optimize remains opt-out", () => {
  assert.deepEqual(resolveMdxOptions({ optimize: false }), { optimize: false });
});

test("custom MDX options pass through", () => {
  const rehypePlugins = [() => undefined];
  assert.deepEqual(resolveMdxOptions({ rehypePlugins }), {
    optimize: true,
    rehypePlugins,
  });
});
