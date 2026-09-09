import { entryRouteUrl } from "./astro-slug.js";

export function requestInventoryEntryUrl(
  prefix: string,
  entryId: string,
  api: boolean,
): string {
  const id = api && entryId === "index" ? "" : entryId;
  return id === "" ? prefix || "/" : `${prefix}/${id}`;
}

export function contentInventoryEntryUrl(
  prefix: string,
  entryId: string,
  api: boolean,
  request: boolean,
): string {
  return request
    ? requestInventoryEntryUrl(prefix, entryId, api)
    : entryRouteUrl(prefix, entryId);
}

export function requestInventoryVersionStatusKey(
  collection: string,
  api: boolean,
  version?: string,
): string {
  return api && version ? `${collection}@${version}` : collection;
}

export interface RequestRouteInventoryEntry {
  collection: string;
  url: string;
  request: boolean;
  discoverable: boolean;
  searchable: boolean;
  title: string;
  description?: string;
  content?: string;
  language: string;
  version?: string;
  deprecated?: boolean;
}
