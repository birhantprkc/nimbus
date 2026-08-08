/**
 * `nimbus-docs add adapter-<id>` — the server-output opt-in (ticket AC#1, #6).
 * Delegates the pure marker edit to `_internal/adapters.ts`; owns the
 * filesystem half of the conflict matrix (locate the config, refuse non-Astro /
 * monorepo roots, warn on existing redirect files), the dep install, and
 * `nimbus.json` provenance. It never writes `.nimbus/features.json` — that's a
 * build-emitted cache derived from the committed footprint.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADAPTER_RECIPES,
  applyAdapterToConfig,
  isCommonJsConfig,
  type AdapterId,
  type AdapterRecipe,
} from "../_internal/adapters.js";
import { satisfies } from "../_internal/semver-lite.js";
import { quoteForDisplay } from "./pm.js";
import { writeFileAtomic } from "./fs-atomic.js";
import {
  NIMBUS_JSON,
  readNimbusJson,
  writeNimbusJson,
} from "./nimbus-json.js";

const ASTRO_CONFIG_NAMES = [
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.mjs",
  "astro.config.js",
  "astro.config.cjs",
] as const;

export type AdapterInstallOutcome =
  | {
      status: "applied";
      adapter: AdapterId;
      configPath: string;
      depsInstalled: string[];
      warnings: string[];
    }
  | {
      status: "noop";
      adapter: AdapterId;
      configPath: string;
      depsInstalled: string[];
      warnings: string[];
    }
  | { status: "error"; code: AdapterInstallErrorCode; message: string };

export type AdapterInstallErrorCode =
  | "non-astro-project"
  | "monorepo-root"
  | "cjs-config"
  | "missing-marker"
  | "no-output"
  | "dirty-output"
  | "existing-adapter"
  | "write-failed"
  | "deps-failed";

// Injected so the orchestrator is unit-testable without a real install.
export type DepInstaller = (
  deps: string[],
  cwd: string,
) => Promise<{ ok: boolean; message?: string }>;

export interface AdapterInstallOptions {
  cwd: string;
  installDeps: DepInstaller;
}

export function resolveAstroConfig(
  cwd: string,
): { path: string; source: string } | null {
  for (const name of ASTRO_CONFIG_NAMES) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    try {
      return { path, source: readFileSync(path, "utf8") };
    } catch {
      return null; // vanished/unreadable between check and read → treat as absent
    }
  }
  return null;
}

function readPackageJson(cwd: string): Record<string, unknown> | null {
  const path = join(cwd, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasAstroDependency(pkg: Record<string, unknown> | null): boolean {
  if (!pkg) return false;
  const deps = { ...(pkg.dependencies as object), ...(pkg.devDependencies as object) };
  return Object.prototype.hasOwnProperty.call(deps, "astro");
}

function looksLikeMonorepoRoot(pkg: Record<string, unknown> | null, cwd: string): boolean {
  if (pkg && "workspaces" in pkg) return true;
  if (existsSync(join(cwd, "pnpm-workspace.yaml"))) return true;
  return false;
}

function detectRedirectConflicts(cwd: string): string[] {
  const warnings: string[] = [];
  if (existsSync(join(cwd, "vercel.json"))) {
    warnings.push(
      "Found an existing vercel.json — Nimbus will merge its generated redirects " +
        "into it on build; review the result before deploying.",
    );
  }
  if (existsSync(join(cwd, "public", "_redirects"))) {
    warnings.push(
      "Found an existing public/_redirects — Nimbus will append its generated " +
        "redirects on build; review the result before deploying.",
    );
  }
  return warnings;
}

export async function installAdapter(
  adapter: AdapterId,
  options: AdapterInstallOptions,
): Promise<AdapterInstallOutcome> {
  const { cwd } = options;
  const recipe = ADAPTER_RECIPES[adapter];
  const pkg = readPackageJson(cwd);
  const config = resolveAstroConfig(cwd);

  // Filesystem conflicts the pure editor can't see.
  if (!config) {
    if (looksLikeMonorepoRoot(pkg, cwd)) {
      return {
        status: "error",
        code: "monorepo-root",
        message:
          "No astro.config here, but this looks like a workspace root. `cd` into " +
          "your docs package (the one with astro.config.*) and re-run.",
      };
    }
    return {
      status: "error",
      code: "non-astro-project",
      message:
        "No astro.config.{ts,mjs,js,…} found here. Run this from your Astro " +
        "project root — the directory with your astro config and package.json.",
    };
  }
  if (!hasAstroDependency(pkg)) {
    return {
      status: "error",
      code: "non-astro-project",
      message:
        `Found ${config.path} but no \`astro\` dependency in package.json. ` +
        "Run this from your Astro project root.",
    };
  }
  // The edit inserts an ESM `import`; a CommonJS config can't take one.
  if (config.path.endsWith(".cjs") || isCommonJsConfig(config.source)) {
    return {
      status: "error",
      code: "cjs-config",
      message:
        `${config.path} is a CommonJS module — Nimbus only rewrites ESM astro ` +
        `configs (the edit inserts an \`import\`). Convert it to ESM (rename to ` +
        `astro.config.mjs, use \`import\`/\`export default\`), or flip \`output\` ` +
        `to "server" and add \`adapter: ${recipe.adapterExpression}\` by hand.`,
    };
  }

  const warnings = [
    ...detectRedirectConflicts(cwd),
    ...detectIncompatibleAdapterVersions(recipe, cwd),
  ];

  const edit = applyAdapterToConfig(config.source, adapter);
  if (edit.status === "error") {
    return { status: "error", code: edit.code, message: edit.message };
  }

  // Deps first, config second: a failed install leaves the config untouched
  // (still byte-identical static), never a `server` config missing its adapter.
  // If the later write fails, the only cost is an
  // installed-but-unused package — harmless, dist unchanged.
  const depResult = await installMissingDeps(recipe, cwd, pkg, options.installDeps);
  if (!depResult.ok) {
    return { status: "error", code: "deps-failed", message: depResult.message! };
  }

  if (edit.status === "noop") {
    // Already wired (hand-edit or recovery); deps ensured, record provenance.
    recordAdapterProvenance(cwd, adapter);
    return {
      status: "noop",
      adapter,
      configPath: config.path,
      depsInstalled: depResult.installed,
      warnings,
    };
  }

  try {
    writeFileAtomic(config.path, edit.source);
  } catch (err) {
    return {
      status: "error",
      code: "write-failed",
      message:
        `Installed ${adapter} but couldn't write ${config.path}: ` +
        `${(err as Error).message}. Your site still builds as static; ` +
        `flip \`output\` to "server" and add \`adapter: ${recipe.adapterExpression}\` ` +
        `by hand, or fix the permissions and re-run.`,
    };
  }

  recordAdapterProvenance(cwd, adapter);

  return {
    status: "applied",
    adapter,
    configPath: config.path,
    depsInstalled: depResult.installed,
    warnings,
  };
}

async function installMissingDeps(
  recipe: (typeof ADAPTER_RECIPES)[AdapterId],
  cwd: string,
  pkg: Record<string, unknown> | null,
  installDeps: DepInstaller,
): Promise<{ ok: boolean; installed: string[]; message?: string }> {
  const wanted = [recipe.installSpec, ...recipe.extraDeps];
  const declared = {
    ...((pkg?.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg?.devDependencies as Record<string, unknown>) ?? {}),
  };
  const existingAdapterSpec = declared[recipe.pkg];
  if (
    recipe.id === "cloudflare" &&
    typeof existingAdapterSpec === "string" &&
    !isSupportedCloudflareAdapterRange(existingAdapterSpec)
  ) {
    return {
      ok: false,
      installed: [],
      message:
        `Found ${recipe.pkg}@${existingAdapterSpec}, but Nimbus currently requires ` +
        `${recipe.installSpec}. Update that dependency and re-run.`,
    };
  }
  const already = new Set(Object.keys(declared));
  const missing = wanted.filter((spec) => !already.has(depName(spec)));
  if (missing.length === 0) return { ok: true, installed: [] };

  const res = await installDeps(missing, cwd);
  if (!res.ok) {
    return {
      ok: false,
      installed: [],
      message:
        res.message ??
        `Failed to install ${missing.join(", ")}. Install them manually and re-run.`,
    };
  }
  return { ok: true, installed: missing };
}

// `@scope/pkg@range` → `@scope/pkg` (a leading `@` scope isn't a version separator).
function depName(spec: string): string {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

// Name-match install detection skips a dep that's already present at ANY
// version. Warn (never block, never auto-upgrade) when an already-installed
// adapter version falls outside the recipe's range — a build failure otherwise
// surfaces far from its cause (AC#6 edge).
function detectIncompatibleAdapterVersions(recipe: AdapterRecipe, cwd: string): string[] {
  const warnings: string[] = [];
  for (const spec of [recipe.installSpec, ...recipe.extraDeps]) {
    const name = depName(spec);
    const range = spec.slice(name.length + 1).trim();
    if (!range) continue;
    const installed = readInstalledVersion(cwd, name);
    if (installed && !satisfies(installed, range)) {
      warnings.push(
        `${name}@${installed} is already installed but this adapter recipe expects ` +
          `${range}. Nimbus left your version in place; if the server build fails, ` +
          `install a version in range (e.g. \`add ${quoteForDisplay(spec)}\`).`,
      );
    }
  }
  return warnings;
}

function readInstalledVersion(cwd: string, name: string): string | null {
  const path = join(cwd, "node_modules", name, "package.json");
  if (!existsSync(path)) return null;
  try {
    const version = (JSON.parse(readFileSync(path, "utf8")) as { version?: string }).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

function isSupportedCloudflareAdapterRange(spec: string): boolean {
  const s = spec.trim();
  return /<\s*14\.2\.0/.test(s) || /^~?14\.1\.\d+/.test(s);
}

// Best-effort provenance; render-mode truth is the committed footprint.
function recordAdapterProvenance(cwd: string, adapter: AdapterId): void {
  try {
    const nimbus = readNimbusJson(cwd);
    if (!nimbus) return;
    writeNimbusJson(cwd, { ...nimbus, serverOutput: { adapter } });
  } catch {
    return;
  }
}

export { NIMBUS_JSON };
