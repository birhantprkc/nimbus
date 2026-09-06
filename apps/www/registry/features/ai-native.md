---
{
  "name": "ai-native",
  "type": "registry:feature",
  "title": "Publish Markdown",
  "description": "Add per-page Markdown versions, llms.txt indexes, llms-full.txt, robots.txt, and an AgentDirective to a Nimbus docs site.",
  "markers": ["src/pages/llms.txt.ts", "src/pages/llms-full.txt.ts", "src/pages/[...slug]/index.md.ts"]
}
---

# Publish Markdown

You are helping the user publish Markdown versions and `llms.txt` indexes from an existing Nimbus docs site. These files are deterministic build output on every deployment provider.

Read this entire file before making changes. The target project should already depend on `nimbus-docs` and use the starter-style routes/layouts.

## What to add

Add the same user-owned files the canonical starter ships:

- `src/pages/[...slug]/index.md.ts`
- `src/pages/[...slug]/index.mdx.ts`
- `src/pages/llms.txt.ts`
- `src/pages/llms-full.txt.ts`
- `src/pages/[section]/llms.txt.ts`
- `src/pages/robots.txt.ts`
- `src/components/AgentDirective.astro`

Then wire the layout/page props:

- `src/layouts/BaseLayout.astro` imports `AgentDirective`, accepts `markdownUrl`, emits `<link rel="alternate" type="text/markdown">`, and renders `<AgentDirective />` when `markdownUrl` exists.
- `src/layouts/DocsLayout.astro` accepts `markdownUrl` and forwards it to `BaseLayout`.
- `src/pages/[...slug].astro` computes `markdownUrl` for docs entries and passes it to `DocsLayout`.

Do not add an `ai` config block. Do not add an MCP server. This feature is build-time/static only.

## Reference implementation

Keep all five Markdown routes prerendered and use the prepared helpers from `@cloudflare/nimbus-docs/build`.

```ts title="src/pages/[...slug]/index.md.ts"
import {
  getPreparedMarkdownArtifact,
  getPreparedMarkdownStaticPaths,
  type PreparedMarkdownReference,
} from "@cloudflare/nimbus-docs/build";

export const prerender = true;

interface SlugProps {
  artifact: PreparedMarkdownReference;
}

export const getStaticPaths = () =>
  getPreparedMarkdownStaticPaths({ collection: "docs", surface: "markdown" });

export async function GET({ props }: { props: SlugProps }) {
  const artifact = await getPreparedMarkdownArtifact(props.artifact);
  return new Response(artifact.body, {
    headers: { "Content-Type": artifact.mediaType },
  });
}
```

Create `src/pages/[...slug]/index.mdx.ts` from the same code, changing `surface: "markdown"` to `surface: "source"`.

```ts title="src/pages/llms.txt.ts"
import { getPreparedLlmsArtifact } from "@cloudflare/nimbus-docs/build";

export const prerender = true;

export async function GET() {
  const artifact = await getPreparedLlmsArtifact({
    scope: "site",
    surface: "index",
  });
  return new Response(artifact.body, {
    headers: { "Content-Type": artifact.mediaType },
  });
}
```

Create `src/pages/llms-full.txt.ts` from the same code, changing `surface: "index"` to `surface: "full"`.

```ts title="src/pages/[section]/llms.txt.ts"
import {
  getPreparedLlmsArtifact,
  getPreparedLlmsStaticPaths,
  type PreparedLlmsReference,
} from "@cloudflare/nimbus-docs/build";

export const prerender = true;

interface SectionProps {
  artifact: PreparedLlmsReference;
}

export const getStaticPaths = () => getPreparedLlmsStaticPaths();

export async function GET({ props }: { props: SectionProps }) {
  const artifact = await getPreparedLlmsArtifact(props.artifact);
  return new Response(artifact.body, {
    headers: { "Content-Type": artifact.mediaType },
  });
}
```

Use the target project's existing sitemap URL pattern for `robots.txt`. Keep `AgentDirective.astro` visually hidden and link it to the current page's Markdown version and the top-level `llms.txt` index. Adapt layout import paths and props to the project instead of replacing unrelated layout behavior.

## Verification

Run the user's package manager build command (`pnpm build`, `npm run build`, etc.). Confirm:

- `dist/llms.txt` exists.
- `dist/llms-full.txt` exists and contains discoverable current documentation.
- `dist/robots.txt` exists and includes a `Sitemap:` line.
- `dist/<slug>/index.md` exists for docs entries.
- `dist/<slug>/index.mdx` exists for authored docs entries.
- Section indexes such as `dist/<section>/llms.txt` list their Markdown versions.
- HTML pages include `<link rel="alternate" type="text/markdown" ...>` for docs entries.
- HTML pages include the hidden `[data-ai-agent-directive]` block for docs entries.

If the user deploys to GitHub Pages, remind them to ship `public/.nojekyll` so static `.md` files are not processed by Jekyll. If they need `text/markdown` MIME headers, remind them that this is configured per host (`_headers`, `vercel.json`, CloudFront metadata, etc.).
