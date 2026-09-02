import type { ApiSpec } from "../types.js";
import type { VitePluginLike } from "./virtual-config.js";

const VIRTUAL_ID = "virtual:nimbus/api-build-config";
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

function jsStringLiteral(value: unknown): string {
  return JSON.stringify(JSON.stringify(value))
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function virtualApiBuildConfigPlugin(
  api: ApiSpec[] | undefined,
  root: string,
): VitePluginLike {
  return {
    name: "nimbus-docs:virtual-api-build-config",
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
      return undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return (
        `export const api = JSON.parse(${jsStringLiteral(api ?? [])});\n` +
        `export const root = ${JSON.stringify(root)};\n`
      );
    },
  };
}
