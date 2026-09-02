import GithubSlugger from "github-slugger";

import type { RequestRouteInventoryEntry } from "./request-route-url.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripInlineHtml(value: string): string {
  let output = "";
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf("<", cursor);
    if (start === -1) return output + value.slice(cursor);
    let end = start + 1;
    let quote: '"' | "'" | undefined;
    for (; end < value.length; end++) {
      const character = value[end];
      if (quote) {
        if (character === quote) quote = undefined;
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === ">") {
        break;
      }
    }
    if (end === value.length) return output + value.slice(cursor);
    output += value.slice(cursor, start);
    cursor = end + 1;
  }
  return output;
}

function headingText(markdown: string): string {
  return stripInlineHtml(
    markdown
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"),
  )
    .replace(/[<>]/g, "")
    .replace(/[`*_~]/g, "")
    .trim();
}

export function pagefindMarkdown(markdown: string): string {
  const slugger = new GithubSlugger();
  const html: string[] = [];
  let prose: string[] = [];
  let fence: "`" | "~" | undefined;

  const flush = () => {
    if (prose.length === 0) return;
    html.push(`<pre>${escapeHtml(prose.join("\n"))}</pre>`);
    prose = [];
  };

  for (const line of markdown.split("\n")) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      prose.push(line);
      if (fenceMatch?.[1]?.startsWith(fence)) fence = undefined;
      continue;
    }
    if (fenceMatch?.[1]) {
      fence = fenceMatch[1][0] as "`" | "~";
      prose.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/);
    if (!heading?.[1] || !heading[2]) {
      prose.push(line);
      continue;
    }
    flush();
    const depth = heading[1].length;
    const text = headingText(heading[2]);
    html.push(
      `<h${depth} id="${escapeHtml(slugger.slug(text))}">${escapeHtml(text)}</h${depth}>`,
    );
  }
  flush();
  return html.join("");
}

export function pagefindDocument(entry: RequestRouteInventoryEntry): string {
  const versionFilter = entry.version
    ? ` data-pagefind-filter="version:${escapeHtml(entry.version)}"`
    : "";
  return [
    `<!doctype html><html lang="${escapeHtml(entry.language)}"><head>`,
    `<title>${escapeHtml(entry.title)}</title>`,
    `</head><body><main data-pagefind-body${versionFilter}>`,
    entry.deprecated
      ? '<span hidden data-pagefind-filter="status:deprecated"></span>'
      : "",
    `<h1>${escapeHtml(entry.title)}</h1>`,
    entry.description ? `<p>${escapeHtml(entry.description)}</p>` : "",
    pagefindMarkdown(entry.content ?? ""),
    `</main></body></html>`,
  ].join("");
}
