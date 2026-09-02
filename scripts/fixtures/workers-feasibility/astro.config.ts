import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus from "@cloudflare/nimbus-docs";
import { readFileSync } from "node:fs";
import nimbusConfig from "./nimbus.config";

const rendering = JSON.parse(
  readFileSync(new URL("./.nimbus/feasibility-rendering.json", import.meta.url), "utf8"),
) as Record<string, "build" | "request">;
const integration = nimbus({
  ...nimbusConfig,
  rendering: { collections: rendering },
});

export default defineConfig({
  output: "server",
  adapter: cloudflare({ prerenderEnvironment: "node" }),
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [integration],
});
