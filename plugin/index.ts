import type { Plugin } from "@opencode-ai/plugin"
import { eventHooks } from "./hooks/event"
import { systemHooks } from "./hooks/system"
import { toolHooks } from "./hooks/tool"
import { setLogger } from "./lib/log"
import { mempalaceMemoryTool } from "./tools/mempalace-memory"

export const MempalaceAutosavePlugin: Plugin = async (ctx) => {
  setLogger(ctx.client)
  return {
    ...eventHooks(ctx),
    ...systemHooks(ctx),
    ...toolHooks(),
    tool: {
      mempalace_memory: mempalaceMemoryTool(ctx),
    },
  }
}
