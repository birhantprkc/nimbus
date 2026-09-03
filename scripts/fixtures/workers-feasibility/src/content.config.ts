import { defineCollection } from "astro:content";
import {
  apiCollection,
  docsCollection,
  partialsCollection,
} from "@cloudflare/nimbus-docs/content";
import nimbusConfig from "../nimbus.config";

const api = nimbusConfig.api?.find((entry) => entry.collection === "api");
if (!api) throw new Error('Missing the "api" collection in nimbus.config.ts');

export const collections = {
  docs: defineCollection(docsCollection()),
  partials: defineCollection(partialsCollection()),
  api: defineCollection(apiCollection(api)),
};
