import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVER_SOURCE = resolve(HERE, "../scripts/serve-registry.mjs");

test("PORT=0 reports a reachable OS-assigned port and shuts down cleanly", { timeout: 10_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "nimbus-registry-server-"));
  const scriptDir = join(root, "scripts");
  const registryDir = join(root, "public", "registry");
  const script = join(scriptDir, "serve-registry.mjs");
  let child: ReturnType<typeof spawn> | undefined;

  try {
    await mkdir(scriptDir, { recursive: true });
    await mkdir(registryDir, { recursive: true });
    await copyFile(SERVER_SOURCE, script);
    await writeFile(join(registryDir, "ready.json"), '{"ready":true}\n');

    child = spawn(process.execPath, [script], {
      env: { ...process.env, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stderr!.setEncoding("utf8");
    child.stderr!.on("data", (chunk) => {
      stderr += chunk;
    });

    child.stdout!.setEncoding("utf8");
    await new Promise<void>((resolveReady, reject) => {
      let ready = false;
      child!.stdout!.on("data", (chunk) => {
        stdout += chunk;
        if (
          !ready &&
          /http:\/\/localhost:\d+/.test(stdout) &&
          stdout.includes("[serve-registry] serving ")
        ) {
          ready = true;
          resolveReady();
        }
      });
      child!.once("error", reject);
      child!.once("exit", (code, signal) => {
        if (!ready) {
          reject(
            new Error(
              `server exited before listening (${code ?? signal}): ${stderr}`,
            ),
          );
        }
      });
    });

    const portMatch = stdout.match(/\[serve-registry\] http:\/\/localhost:(\d+)/);
    assert.ok(portMatch, `missing listening URL in stdout; stderr: ${stderr}`);
    const port = Number(portMatch[1]);
    assert.notEqual(port, 0);
    assert.ok(stdout.includes("[serve-registry] serving "));

    const response = await fetch(`http://localhost:${port}/ready.json`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true });

    const closed = once(child, "close");
    child.kill("SIGTERM");
    const [code, signal] = await closed;
    assert.equal(code, 0);
    assert.equal(signal, null);
  } finally {
    if (child?.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "close");
    }
    await rm(root, { recursive: true, force: true });
  }
});
