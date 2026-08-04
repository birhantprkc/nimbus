import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "tsdown";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string; engines?: { node?: string } };

// Minimum Node is taken from this package's own `engines.node`.
const minNodeVersion = pkg.engines?.node?.replace(/^>=/, "") ?? "20.0.0";
const isPreview = process.env.NIMBUS_PREVIEW === "1";
const previewPr = process.env.PR_NUMBER ?? null;

function requirePreviewPr(): string {
  if (!previewPr || !/^[1-9]\d*$/.test(previewPr)) {
    throw new Error("NIMBUS_PREVIEW=1 requires a positive integer PR_NUMBER.");
  }
  return previewPr;
}

export default defineConfig({
  entry: ["src/index.ts"],
  format: "esm",
  target: "node20",
  platform: "node",
  clean: true,
  dts: false,
  outputOptions: {
    entryFileNames: "[name].js",
    chunkFileNames: "[name]-[hash].js",
    banner: "#!/usr/bin/env node",
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __MIN_NODE_VERSION__: JSON.stringify(minNodeVersion),
    __PREVIEW__: JSON.stringify(isPreview),
    __PREVIEW_PR__: JSON.stringify(previewPr),
  },
  hooks: {
    async "build:done"(ctx) {
      if (!isPreview) return;

      const pr = requirePreviewPr();
      const templatesDir = resolve(ctx.options.outDir, "templates");
      const [{ generateTemplates }, { repinPreview }] = await Promise.all([
        import("./scripts/copy-template.mjs"),
        import("./scripts/repin-preview.mjs"),
      ]);

      generateTemplates(templatesDir);
      repinPreview(templatesDir, pr);
    },
  },
});
