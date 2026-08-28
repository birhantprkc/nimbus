/**
 * Vite plugin: rewrite `[text](api.ref:…)` citation links to resolved URLs in
 * `.md`/`.mdx` source before the markdown compiler runs.
 */

import path from "node:path";

import { hasCitation, resolveCitations, type CitationIndex } from "./citations.js";

export interface CitationPluginOptions {
  contentDirs: ReadonlyArray<string>;
  getCitationIndex: () => CitationIndex;
  skip?: (filePath: string) => boolean;
}

export function citationPlugin(options: CitationPluginOptions) {
  const normalizedDirs = options.contentDirs.map((d) => path.resolve(d));

  return {
    name: "nimbus-docs:citations",
    enforce: "pre" as const,
    transform(code: string, id: string) {
      const [pathOnly] = id.split("?", 1);
      if (!pathOnly) return null;
      if (!pathOnly.endsWith(".mdx") && !pathOnly.endsWith(".md")) return null;

      const absolute = path.resolve(pathOnly);
      const inScope = normalizedDirs.some(
        (dir) => absolute === dir || absolute.startsWith(dir + path.sep),
      );
      if (!inScope) return null;
      if (options.skip?.(absolute)) return null;
      if (!hasCitation(code)) return null;

      const { code: rewritten, diagnostics } = resolveCitations(code, {
        mode: "author",
        citationIndex: options.getCitationIndex(),
      });

      const errors = diagnostics.filter((d) => d.level === "error");
      if (errors.length > 0) {
        throw new Error(
          `nimbus-docs: unresolved API citation in ${path.relative(process.cwd(), absolute)}:\n` +
            errors.map((e) => `  - ${e.message}`).join("\n"),
        );
      }
      for (const w of diagnostics) {
        if (w.level === "warning") {
          console.warn(`[nimbus:api:cite] ${path.relative(process.cwd(), absolute)}: ${w.message}`);
        }
      }

      return { code: rewritten, map: null };
    },
  };
}
