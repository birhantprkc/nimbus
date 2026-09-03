import assert from "node:assert/strict";
import { test } from "node:test";

import { ADAPTER_IDS, INTERACTIVE_ADAPTER_OPTIONS } from "../src/prompts.js";

test("interactive server setup only offers Cloudflare", () => {
  assert.deepEqual(INTERACTIVE_ADAPTER_OPTIONS, [
    { value: "cloudflare", label: "Cloudflare" },
  ]);
  assert.deepEqual(new Set(ADAPTER_IDS), new Set(["vercel", "node", "netlify", "cloudflare"]));
});
