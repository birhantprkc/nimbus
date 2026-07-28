import fs from "node:fs";
import path from "node:path";

export function fileExists(cwd: string, rel: string): boolean {
  return fs.existsSync(path.join(cwd, rel));
}

export function hasPackageJson(cwd: string): boolean {
  return fileExists(cwd, "package.json");
}

// Walk the `node_modules` chain from `cwd` to the filesystem root — the same
// lookup Node performs — so a dep hoisted to a workspace root (npm/yarn) is
// found, not just one in the project's own `node_modules` (pnpm). Checking the
// manifest path directly avoids the `require.resolve("<pkg>/package.json")`
// pitfall, where a restrictive `exports` field throws for an installed package.
export function depInstalled(cwd: string, pkg: string): boolean {
  const binName = process.platform === "win32" ? `${pkg}.cmd` : pkg;
  let dir = cwd;
  for (;;) {
    const nodeModules = path.join(dir, "node_modules");
    if (fs.existsSync(path.join(nodeModules, pkg, "package.json"))) return true;
    if (fs.existsSync(path.join(nodeModules, ".bin", binName))) return true;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}
