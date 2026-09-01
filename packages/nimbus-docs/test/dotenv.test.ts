import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseDotenv, readBuildEnv } from "../src/_internal/dotenv.js";
import { loadDotenv } from "../src/cli/dotenv.js";

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

test("parseDotenv strips inline comments outside quoted values", () => {
  const out = parseDotenv(
    `EMPTY= # note\nVALUE=secret # note\nQUOTED="value # kept" # note "ignored"`,
  );
  assert.equal(out.get("EMPTY"), "");
  assert.equal(out.get("VALUE"), "secret");
  assert.equal(out.get("QUOTED"), "value # kept");
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

test("parseDotenv treats a lone-quote value as empty after stripping", () => {
  assert.equal(parseDotenv(`A=""`).get("A"), "");
});

test("parseDotenv accepts export syntax and multiline quoted values", () => {
  const out = parseDotenv('export TOKEN=value\nMULTI="one\ntwo"');
  assert.equal(out.get("TOKEN"), "value");
  assert.equal(out.get("MULTI"), "one\ntwo");
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

test("readBuildEnv unions keys across Vite's production .env files", () => {
  withTmp(
    { ".env": "A=1", ".env.production": "B=2", ".env.local": "C=3" },
    (dir) => {
      const out = readBuildEnv(dir);
      assert.equal(out.A, "1");
      assert.equal(out.B, "2");
      assert.equal(out.C, "3");
    },
  );
});

test("readBuildEnv: an empty placeholder never shadows a production value", () => {
  withTmp({ ".env": "TOKEN=", ".env.production": "TOKEN=real" }, (dir) => {
    assert.equal(readBuildEnv(dir).TOKEN, "real");
  });
});

test("readBuildEnv: a higher-precedence empty entry overrides an earlier value", () => {
  withTmp({ ".env": "TOKEN=real", ".env.production": "TOKEN=" }, (dir) => {
    // `.env.production` outranks `.env` and wins even when empty — exactly how
    // Vite resolves TOKEN at build time. The preflight must therefore see it as
    // unset, not falsely report the shadowed `.env` value as present.
    assert.equal(readBuildEnv(dir).TOKEN, "");
  });
});

test("readBuildEnv expands variables and accepts export syntax", () => {
  withTmp(
    {
      ".env": "BASE=secret\nTOKEN=$UNSET",
      ".env.production": "export EXPANDED=$BASE-suffix",
    },
    (dir) => {
      const out = readBuildEnv(dir);
      assert.equal(out.TOKEN, "");
      assert.equal(out.EXPANDED, "secret-suffix");
    },
  );
});

test("readBuildEnv ignores development mode files", () => {
  withTmp({ ".env.development": "NIMBUS_DOTENV_DEV_ONLY=yes" }, (dir) => {
    assert.equal(readBuildEnv(dir).NIMBUS_DOTENV_DEV_ONLY, undefined);
  });
});

test("readBuildEnv preserves an explicitly empty shell value", () => {
  const key = "NIMBUS_DOTENV_SHELL_EMPTY";
  const previous = process.env[key];
  process.env[key] = "";
  try {
    withTmp({ ".env.production": `${key}=file-secret` }, (dir) => {
      assert.equal(readBuildEnv(dir)[key], "");
    });
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("readBuildEnv exposes shell values when no dotenv files exist", () => {
  const key = "NIMBUS_DOTENV_SHELL_ONLY";
  const previous = process.env[key];
  process.env[key] = "shell-secret";
  try {
    withTmp({}, (dir) => {
      assert.equal(readBuildEnv(dir)[key], "shell-secret");
    });
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});

test("CLI dotenv startup loads only NIMBUS_REGISTRY_URL", () => {
  const previousRegistry = process.env.NIMBUS_REGISTRY_URL;
  const previousToken = process.env.NIMBUS_DOTENV_FEATURE_TOKEN;
  delete process.env.NIMBUS_REGISTRY_URL;
  delete process.env.NIMBUS_DOTENV_FEATURE_TOKEN;
  try {
    withTmp(
      {
        ".env":
          "NIMBUS_REGISTRY_URL=https://registry.example.test\n" +
          "NIMBUS_DOTENV_FEATURE_TOKEN=must-not-leak",
      },
      (dir) => loadDotenv(dir),
    );
    assert.equal(
      process.env.NIMBUS_REGISTRY_URL,
      "https://registry.example.test",
    );
    assert.equal(process.env.NIMBUS_DOTENV_FEATURE_TOKEN, undefined);
  } finally {
    if (previousRegistry === undefined) delete process.env.NIMBUS_REGISTRY_URL;
    else process.env.NIMBUS_REGISTRY_URL = previousRegistry;
    if (previousToken === undefined) delete process.env.NIMBUS_DOTENV_FEATURE_TOKEN;
    else process.env.NIMBUS_DOTENV_FEATURE_TOKEN = previousToken;
  }
});

test("readBuildEnv returns no project keys when no .env files exist", () => {
  withTmp({}, (dir) => {
    assert.equal(readBuildEnv(dir).NIMBUS_DOTENV_ABSENT, undefined);
  });
});
