// Pure `.env` parsing shared by the CLI's startup loader and the build-free env
// preflight. Kept dependency-free and non-mutating; `loadDotenv` layers the
// process.env side effect on top.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The files Vite/Astro load for a production build. Preflight unions their keys
// so a secret set in any of them isn't falsely reported missing. Presence, not
// precedence: a non-empty value anywhere wins, so an empty template placeholder
// in `.env` never shadows the real value in `.env.production`.
const DOTENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

export function parseDotenv(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out.set(key, value);
  }
  return out;
}

export function readDotenvVars(cwd: string): Map<string, string> {
  const merged = new Map<string, string>();
  for (const file of DOTENV_FILES) {
    const path = join(cwd, file);
    if (!existsSync(path)) continue;
    try {
      for (const [key, value] of parseDotenv(readFileSync(path, "utf8"))) {
        const existing = merged.get(key);
        if (existing === undefined || existing.trim() === "")
          merged.set(key, value);
      }
    } catch {
      // Unreadable file — skip; a missing/locked .env is not a check failure.
    }
  }
  return merged;
}
