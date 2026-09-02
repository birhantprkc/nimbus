import { defineConfig } from "@cloudflare/nimbus-docs/config";

export default defineConfig({
  site: "https://workers-feasibility.test",
  title: "Workers feasibility",
  description: "BG-1c.0 request-rendering fixture.",
  locale: "en",
  github: null,
  rendering: { collections: { api: "request" } },
  api: [
    {
      collection: "api",
      spec: "src/content/api/openapi.json",
      label: "Feasibility API",
    },
  ],
});
