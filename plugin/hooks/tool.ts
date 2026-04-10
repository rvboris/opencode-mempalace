import { writeLog } from "../lib/log"
import { isDirectMempalaceMutationTool } from "../lib/enforcement"

export const toolHooks = () => {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID?: string; callID?: string },
      _output: { args: Record<string, unknown> },
    ) => {
      if (isDirectMempalaceMutationTool(input.tool)) {
        await writeLog("WARN", "blocked direct mempalace mutation tool", {
          tool: input.tool,
          sessionId: input.sessionID,
        })
        throw new Error("Use mempalace_memory instead of direct MemPalace mutation tools")
      }
    },
  }
}
