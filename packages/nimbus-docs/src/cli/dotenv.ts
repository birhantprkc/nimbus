// Loads `.env` into process.env at CLI startup, but only for keys not already
// set, so a shell-provided env always wins over the file. Lets `examples/local/
// .env` carry `NIMBUS_REGISTRY_URL=...` without prefixing every invocation.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseDotenv } from "../_internal/dotenv.js";

export function loadDotenv(cwd: string): void {
  const path = join(cwd, ".env");
  if (!existsSync(path)) return;

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }

  for (const [key, value] of parseDotenv(raw)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
