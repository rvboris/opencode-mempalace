import { LOG_MESSAGES, TOOL_ERROR_MESSAGES } from "../lib/constants"
import { writeLog } from "../lib/log"
import { isDirectMempalaceMutationTool } from "../lib/enforcement"

export const toolHooks = () => {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID?: string; callID?: string },
      _output: { args: Record<string, unknown> },
    ) => {
      if (isDirectMempalaceMutationTool(input.tool)) {
        await writeLog("WARN", LOG_MESSAGES.blockedDirectMempalaceMutationTool, {
          tool: input.tool,
          sessionId: input.sessionID,
        })
        throw new Error(TOOL_ERROR_MESSAGES.directMutationBlocked)
      }
    },
  }
}
