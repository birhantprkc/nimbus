import { parseEnv } from "node:util";
import { loadEnv } from "vite";

export function parseDotenv(raw: string): Map<string, string> {
  const parsed = new Map<string, string>();
  for (const [key, value] of Object.entries(parseEnv(raw))) {
    if (value !== undefined) parsed.set(key, value);
  }
  return parsed;
}

export function readBuildEnv(cwd: string): Record<string, string> {
  return loadEnv("production", cwd, "");
}
