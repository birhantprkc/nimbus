import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { readFile } from "node:fs/promises";
import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";
import {
  buildApiModel,
  getApiNav,
  getApiPageProps,
  getApiPageSlugs,
  type ApiNav,
  type ApiPageProps,
} from "@cloudflare/nimbus-docs/api";

const source = {
  collection: "api",
  mountPath: "/api",
  label: "Feasibility API",
};

const api = defineCollection({
  loader: {
    name: "workers-feasibility:prepared-api",
    async load({ store, parseData }) {
      store.clear();
      const spec = JSON.parse(
        await readFile(new URL("./content/api/openapi.json", import.meta.url), "utf8"),
      );
      const model = await buildApiModel({ ...source, spec });
      for (const { coordinate, slug } of getApiPageSlugs(model)) {
        const id = slug || "index";
        const data = await parseData({
          id,
          data: {
            coordinate,
            page: getApiPageProps(model, coordinate),
            nav: getApiNav(model, coordinate),
          },
        });
        store.set({ id, data });
      }
    },
  },
  schema: z.object({
    coordinate: z.string(),
    page: z.custom<ApiPageProps>(),
    nav: z.custom<ApiNav>(),
  }),
});

export const collections = {
  docs: defineCollection(docsCollection()),
  partials: defineCollection(partialsCollection()),
  api,
};
