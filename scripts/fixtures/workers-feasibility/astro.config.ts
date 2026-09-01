import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import nimbus from "@cloudflare/nimbus-docs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nimbusConfig from "./nimbus.config";

const rendering = JSON.parse(
  readFileSync(new URL("./.nimbus/feasibility-rendering.json", import.meta.url), "utf8"),
) as Record<string, unknown>;
const integration = nimbus(nimbusConfig);
const hooks = { ...integration.hooks };
if (rendering.docs === "request" || rendering.api === "request") {
  delete hooks["astro:build:done"];
}
const routePolicy = {
  name: "workers-feasibility:route-policy",
  hooks: {
    "astro:route:setup": ({ route }: { route: { component: string; prerender?: boolean } }) => {
      const component = route.component.replaceAll("\\", "/");
      if (component.endsWith("src/pages/api/[...slug].astro")) {
        route.prerender = rendering.api !== "request";
      } else if (component.endsWith("src/pages/[...slug].astro")) {
        route.prerender = rendering.docs !== "request";
      }
    },
  },
};

export default defineConfig({
  output: "server",
  adapter: cloudflare({ prerenderEnvironment: "node" }),
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@cloudflare/nimbus-docs/markdown": fileURLToPath(
          new URL("./src/worker-safe-markdown.ts", import.meta.url),
        ),
      },
    },
  },
  integrations: [routePolicy, { ...integration, hooks }],
});
