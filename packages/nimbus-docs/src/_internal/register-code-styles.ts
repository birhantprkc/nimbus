import { codeToHtml } from "shiki";

import {
  getCodeStyleTransformer,
  NIMBUS_DEFAULT_SHIKI_THEMES,
} from "./code-style-registry.js";
import type { ScannedCodeBlock } from "./scan-code-langs.js";

export async function registerCodeBlockStyles(
  blocks: readonly ScannedCodeBlock[],
): Promise<void> {
  for (const block of blocks) {
    await codeToHtml(block.code, {
      lang: block.lang,
      themes: NIMBUS_DEFAULT_SHIKI_THEMES,
      defaultColor: false,
      transformers: [getCodeStyleTransformer()],
    });
  }
}
