export function requestInventoryEntryUrl(
  prefix: string,
  entryId: string,
  api: boolean,
): string {
  const id = api && entryId === "index" ? "" : entryId;
  return id === "" ? prefix || "/" : `${prefix}/${id}`;
}
