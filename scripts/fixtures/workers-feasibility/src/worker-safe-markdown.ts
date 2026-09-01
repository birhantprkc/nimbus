import { fromHtml } from "hast-util-from-html";
import { defaultSchema, sanitize } from "hast-util-sanitize";
import { toHtml } from "hast-util-to-html";
import { micromark } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

export function renderMarkdown(source: string | undefined | null): string {
  if (!source?.trim()) return "";
  const raw = micromark(source.trim(), {
    allowDangerousHtml: true,
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  });
  return toHtml(sanitize(fromHtml(raw, { fragment: true }), defaultSchema));
}
