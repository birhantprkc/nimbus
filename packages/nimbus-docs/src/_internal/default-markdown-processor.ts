import { satteri } from "@astrojs/markdown-satteri";
import type {
  HastPluginDefinition,
  HastPluginInput,
  MdastPluginDefinition,
  MdastPluginInput,
} from "satteri";

export function createDefaultMarkdownProcessor(options: {
  hastPlugins?: HastPluginInput[];
  mdastPlugins?: MdastPluginInput[];
}): ReturnType<typeof satteri> {
  return satteri({
    hastPlugins: (options.hastPlugins ?? []) as HastPluginDefinition[],
    mdastPlugins: (options.mdastPlugins ?? []) as MdastPluginDefinition[],
  });
}
