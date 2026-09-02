import assert from "node:assert/strict";
import { test } from "node:test";
import { virtualApiBuildConfigPlugin } from "../src/_internal/virtual-api-build-config.js";
import { virtualConfigPlugin } from "../src/_internal/virtual-config.js";
import type { NimbusConfig } from "../src/types.js";

const sentinel = "raw-openapi-must-not-ship";
const api = [
  {
    collection: "api",
    spec: {
      openapi: "3.1.0",
      info: { title: "API", version: "1" },
      paths: {},
      sentinel,
    },
  },
];

test("runtime config strips inline API specs", () => {
  const config = { api } as NimbusConfig;
  const plugin = virtualConfigPlugin(config, {
    indexedCollections: ["api"],
    requestRenderingCollections: ["api"],
    versionAlternates: {},
    apiCollections: ["api"],
    headDefaults: {
      favicon: { file: "/favicon.ico", type: "image/x-icon" },
      socialImage: "/opengraph.png",
    },
  });
  const source = plugin.load("\0virtual:nimbus/config");

  assert.ok(source);
  assert.ok(!source.includes(sentinel));
  assert.match(source, /"spec":\{\}/);
});

test("build-only API config retains specs and the project root", () => {
  const plugin = virtualApiBuildConfigPlugin(api, "/project");
  const source = plugin.load("\0virtual:nimbus/api-build-config");

  assert.ok(source);
  assert.ok(source.includes(sentinel));
  assert.ok(source.includes("/project"));
});
