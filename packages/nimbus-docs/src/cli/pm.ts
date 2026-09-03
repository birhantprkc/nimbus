/**
 * Package-manager detection + install command helpers.
 *
 * Detection order, strongest signal first:
 *   1. a lockfile in the user's cwd (nearest, most explicit),
 *   2. `npm_config_user_agent` — how the user actually invoked the CLI
 *      (authoritative; never shadowed by a distant ancestor lockfile),
 *   3. a lockfile in an ancestor directory — a package inside a monorepo
 *      whose lockfile lives at the workspace root, invoked without a PM
 *      user-agent (e.g. bare `node`/CI),
 *   4. `npm`.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

import { getCommand } from "../lib/pkgm.js";

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

/**
 * The published package name. The bin is `nimbus-docs`, but the *package*
 * is scoped — and the unscoped `nimbus-docs` on npm is a different, legacy
 * package, so any command we print for a user to run must use the scoped
 * name via `dlx`/`npx`.
 */
export const CLI_PACKAGE = "@cloudflare/nimbus-docs";

const LOCKFILES: ReadonlyArray<readonly [string, PackageManager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

export function detectPackageManager(cwd: string): PackageManager {
  const inCwd = lockfileManager(cwd);
  if (inCwd) return inCwd;

  const ua = process.env.npm_config_user_agent ?? "";
  if (ua.startsWith("pnpm")) return "pnpm";
  if (ua.startsWith("yarn")) return "yarn";
  if (ua.startsWith("bun")) return "bun";

  // Last-ditch before npm: a workspace-root lockfile above a monorepo package
  // dir, when the CLI was invoked without a package-manager user-agent.
  let dir = cwd;
  for (;;) {
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
    const pm = lockfileManager(dir);
    if (pm) return pm;
  }
  return "npm";
}

function lockfileManager(dir: string): PackageManager | null {
  for (const [lockfile, pm] of LOCKFILES) {
    if (existsSync(join(dir, lockfile))) return pm;
  }
  return null;
}

/**
 * A runnable invocation of this CLI to print in user-facing hints, e.g.
 * `pnpm dlx @cloudflare/nimbus-docs list`. Uses the caller's package
 * manager (detected from `cwd`) and always the scoped package via
 * `dlx`/`npx`, so the hint runs whether or not the CLI is installed
 * locally — and never resolves the legacy *unscoped* `nimbus-docs`
 * package by accident.
 *
 *   invocation("list")            → "pnpm dlx @cloudflare/nimbus-docs list"
 *   invocation("add 404-page")    → "npx @cloudflare/nimbus-docs add 404-page"
 *
 * Yarn resolves to `yarn dlx`, which is Yarn Berry (v2+); Yarn Classic (v1)
 * has no `dlx`. That's the deliberate target — it matches the docs'
 * `<PackageManagers>` widget, and bare `nimbus-docs` was equally unrunnable
 * on v1 — so this is a lateral move there and a fix for Berry (the default).
 */
export function invocation(sub: string, cwd = process.cwd()): string {
  return getCommand(detectPackageManager(cwd), "dlx", CLI_PACKAGE, { args: sub })!;
}

/**
 * The package-manager-appropriate command to update this CLI's package to
 * the latest published version, e.g. `pnpm add @cloudflare/nimbus-docs@latest`
 * (npm → `npm i …`, yarn → `yarn add …`, bun → `bun add …`). Uses `add @latest`
 * rather than each PM's divergent `update`/`upgrade`/`up` verb so it's correct
 * everywhere.
 */
export function updateCommand(cwd = process.cwd()): string {
  return getCommand(detectPackageManager(cwd), "add", `${CLI_PACKAGE}@latest`)!;
}

/**
 * Command + args to install one or more new npm deps. Each PM picks the
 * verb that both adds to package.json AND installs:
 *
 *   npm  install <deps...>
 *   pnpm add --ignore-workspace-root-check <deps...>
 *   yarn add     <deps...>
 *   bun  add     <deps...>
 */
// Quote a token for copy-paste into a POSIX shell. Adapter specs like
// `@astrojs/cloudflare@>=14.1.0 <14.2.0` carry a space and `<`/`>` redirections;
// a clean package spec is returned unchanged.
export function quoteForDisplay(token: string): string {
  if (/^[A-Za-z0-9@._/:^~+-]+$/.test(token)) return token;
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

export function addCommand(
  pm: PackageManager,
  deps: string[],
  options: { exact?: boolean } = {},
): { bin: string; args: string[] } {
  if (deps.length === 0) {
    throw new Error("addCommand called with empty deps");
  }
  switch (pm) {
    case "npm":
      return {
        bin: "npm",
        args: ["install", ...(options.exact ? ["--save-exact"] : []), ...deps],
      };
    case "pnpm":
      // Generated Nimbus sites carry pnpm-workspace.yaml for the build-script
      // allowlist, so pnpm treats the site as a workspace root and otherwise
      // refuses the add. This flag still targets cwd in nested monorepos.
      return {
        bin: "pnpm",
        args: [
          "add",
          "--ignore-workspace-root-check",
          ...(options.exact ? ["--save-exact"] : []),
          ...deps,
        ],
      };
    case "yarn":
      return {
        bin: "yarn",
        args: ["add", ...(options.exact ? ["--exact"] : []), ...deps],
      };
    case "bun":
      return {
        bin: "bun",
        args: ["add", ...(options.exact ? ["--exact"] : []), ...deps],
      };
  }
}
