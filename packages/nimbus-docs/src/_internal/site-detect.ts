// Auto-detect `site` from platform env when the configured value is still the
// placeholder, killing the `example.com` foot-gun that breaks canonical URLs,
// sitemap, robots.txt, and llms.txt. Vercel/Netlify expose a STABLE production
// domain we adopt only on production (a preview build must not bake a preview
// URL into canonical); Cloudflare Pages exposes only a per-deploy URL, so we
// adopt it with a caveat; bare Cloudflare Workers exposes nothing, so we warn.
// An explicitly configured (non-placeholder) `site` always wins.

export interface SiteDetectInput {
  configuredSite: string;
  env: Record<string, string | undefined>;
  cloudflareSignal: boolean;
}

export interface SiteDetectResult {
  site: string;
  adopted: boolean;
  warning: string | null;
}

export function resolveSite({
  configuredSite,
  env,
  cloudflareSignal,
}: SiteDetectInput): SiteDetectResult {
  if (!isPlaceholder(configuredSite)) {
    return { site: configuredSite, adopted: false, warning: null };
  }

  const keep = (warning: string): SiteDetectResult => ({
    site: configuredSite,
    adopted: false,
    warning,
  });
  // A truthy-but-blank platform var must not be normalized into `https://`.
  const adopt = (
    raw: string | undefined,
    onMissing: string,
    warning: string | null = null,
  ): SiteDetectResult =>
    raw && raw.trim() !== ""
      ? { site: normalizeUrl(raw), adopted: true, warning }
      : keep(onMissing);

  if (env.VERCEL) {
    if (env.VERCEL_ENV === "production") {
      return adopt(
        env.VERCEL_PROJECT_PRODUCTION_URL,
        missingVar("VERCEL_PROJECT_PRODUCTION_URL", configuredSite),
      );
    }
    return keep(preview("Vercel", configuredSite));
  }

  if (env.NETLIFY) {
    if (env.CONTEXT === "production") {
      return adopt(env.URL, missingVar("URL", configuredSite));
    }
    return keep(preview("Netlify", configuredSite));
  }

  if (env.CF_PAGES) {
    return adopt(
      env.CF_PAGES_URL,
      missingVar("CF_PAGES_URL", configuredSite),
      "nimbus: adopted the Cloudflare Pages deploy URL for `site`; if this is a " +
        "preview deploy, set `site` explicitly to your production domain.",
    );
  }

  if (cloudflareSignal) {
    return keep(
      "nimbus: Cloudflare Workers exposes no deploy-URL env, so `site` can't be " +
        `auto-detected and stays the placeholder \`${configuredSite}\`. Set \`site\` ` +
        "in your Nimbus config to your production origin.",
    );
  }

  return keep(
    `nimbus: \`site\` is the placeholder \`${configuredSite}\` — set it to your ` +
      "production origin (canonical URLs, sitemap, robots.txt, and llms.txt depend on it).",
  );
}

// Broad on purpose: the whole `example.com` space is RFC-2606 reserved and can
// never be a real origin, so any such host is safe to override with platform
// env. The `check` lint uses a narrower literal-string gate — see the note there
// before unifying the two.
function isPlaceholder(site: string): boolean {
  const host = hostnameOf(site);
  return host === "example.com" || (host?.endsWith(".example.com") ?? false);
}

function hostnameOf(site: string): string | null {
  try {
    return new URL(site).hostname;
  } catch {
    return null;
  }
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

function preview(platform: string, configuredSite: string): string {
  return (
    `nimbus: ${platform} preview build — keeping \`site\` (${configuredSite}) rather ` +
    "than adopting a preview URL as canonical. Set `site` in your Nimbus config for production."
  );
}

function missingVar(name: string, configuredSite: string): string {
  return (
    `nimbus: expected ${name} to auto-detect \`site\`, but it is unset — \`site\` is ` +
    `still the placeholder \`${configuredSite}\`. Set \`site\` in your Nimbus config.`
  );
}
