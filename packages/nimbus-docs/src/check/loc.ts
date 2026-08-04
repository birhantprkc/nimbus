/**
 * Location helpers shared by the check categories — one implementation of
 * "project-relative path" and "1-based line of an offset" so env and
 * structure findings render identically.
 */

import path from "node:path";

/** Project-relative, forward-slashed path (falls back to the absolute path). */
export function relFile(abs: string): string {
  return path.relative(process.cwd(), abs).replace(/\\/g, "/") || abs;
}

/** 1-based line number of an absolute character offset in `source`. */
export function lineOf(source: string, offset: number): number {
  let line = 1;
  const end = Math.min(offset, source.length);
  for (let i = 0; i < end; i++) if (source[i] === "\n") line++;
  return line;
}
