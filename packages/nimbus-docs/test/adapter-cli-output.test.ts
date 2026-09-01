import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const CLI = fileURLToPath(new URL("../src/cli/index.ts", import.meta.url));
const TSX = import.meta.resolve("tsx");

test("adapter no-op reports a wrangler write", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-adapter-cli-"));
  fs.writeFileSync(
    path.join(dir, "astro.config.ts"),
    `import cloudflare from "@astrojs/cloudflare";
export default {
  // nimbus:adapter
  output: "server",
  adapter: cloudflare({ prerenderEnvironment: "node" }),
};
`,
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      dependencies: {
        astro: "7.0.9",
        "@astrojs/cloudflare": "14.1.7",
      },
    }),
  );

  try {
    const result = spawnSync(
      process.execPath,
      ["--import", TSX, CLI, "add", "adapter-cloudflare"],
      { cwd: dir, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.ok(fs.existsSync(path.join(dir, "wrangler.jsonc")));
    assert.match(output, /Wrote wrangler\.jsonc \(server\)/);
    assert.doesNotMatch(output, /Nothing to do/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("adapter install reports partial success when wrangler cannot be written", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nimbus-adapter-cli-"));
  fs.writeFileSync(
    path.join(dir, "astro.config.ts"),
    `import cloudflare from "@astrojs/cloudflare";
export default {
  // nimbus:adapter
  output: "server",
  adapter: cloudflare({ prerenderEnvironment: "node" }),
};
`,
  );
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({
      dependencies: {
        astro: "7.0.9",
        "@astrojs/cloudflare": "14.1.7",
      },
    }),
  );

  try {
    const result = spawnSync(
      "/bin/sh",
      [
        "-c",
        'mkdir "wrangler.jsonc" && exec "$NODE_BIN" --import "$TSX_PATH" "$CLI_PATH" add adapter-cloudflare',
      ],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          NODE_BIN: process.execPath,
          TSX_PATH: TSX,
          CLI_PATH: CLI,
        },
      },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /! Cloudflare server deployment is only partially configured/);
    assert.doesNotMatch(output, /Wrote wrangler\.jsonc/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
