import assert from "node:assert/strict";
import { test } from "node:test";

import { nimbus } from "../src/integration.js";

const config = {
  site: "https://example.test",
  title: "Test",
};

test("accepts generated Markdown customization under markdown", () => {
  assert.doesNotThrow(() =>
    nimbus(config, {
      markdown: {
        componentMap: {
          ProductName: {
            revision: "product-name-v1",
            render: ({ children }) => children,
          },
        },
        partialResolver: {
          revision: "product-partials-v1",
          resolve: ({ file, product }) =>
            product ? `${product}/${file}` : file,
        },
      },
    }),
  );
});

test("reports markdown.componentMap validation paths", () => {
  assert.throws(
    () =>
      nimbus(config, {
        markdown: {
          componentMap: { ProductName: { revision: "v1" } as never },
        },
      }),
    /markdown\.componentMap\.ProductName must define a render function/,
  );
  assert.throws(
    () =>
      nimbus(config, {
        markdown: {
          componentMap: {
            ProductName: { revision: "", render: () => "" },
          },
        },
      }),
    /markdown\.componentMap\.ProductName\.revision must be a non-empty string/,
  );
});

test("reports markdown.partialResolver validation paths", () => {
  assert.throws(
    () =>
      nimbus(config, {
        markdown: {
          partialResolver: { revision: "v1" } as never,
        },
      }),
    /markdown\.partialResolver must define a resolve function/,
  );
  assert.throws(
    () =>
      nimbus(config, {
        markdown: {
          partialResolver: { revision: "", resolve: ({ file }) => file },
        },
      }),
    /markdown\.partialResolver\.revision must be a non-empty string/,
  );
});
