import { writeLog } from "../lib/log"
import { AutosaveStatus, getSessionState, markMutationToolCall, recordSuccessfulTool, shouldCountSuccessfulTool } from "../lib/autosave"
import { isDirectMempalaceMutationTool } from "../lib/enforcement"

const isMempalaceTool = (tool: string) => tool === "mempalace_memory"
const isSuccessfulToolOutput = (output: { output?: string; metadata?: any }) => {
  const text = `${output.output || ""} ${JSON.stringify(output.metadata || {})}`.toLowerCase()
  return !text.includes("\"success\":false") && !text.includes("error")
}

const getMetadataSessionId = (metadata: any) => {
  return metadata?.sessionID || metadata?.sessionId || metadata?.session?.id
}

export const toolHooks = () => {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID?: string; callID?: string },
      output: { args: any },
    ) => {
      if (isDirectMempalaceMutationTool(input.tool)) {
        await writeLog("WARN", "blocked direct mempalace mutation tool", {
          tool: input.tool,
          sessionId: input.sessionID,
        })
        throw new Error("Use mempalace_memory instead of direct MemPalace mutation tools")
      }
      if (input.tool !== "mempalace_memory" || !input.sessionID) return
      const mode = output.args?.mode
      if (mode === "save" || mode === "kg_add" || mode === "diary_write") {
        markMutationToolCall(input.sessionID, input.callID)
      }
    },
    "tool.execute.after": async (
      input: { tool: string; sessionID?: string; callID?: string },
      output: { output: string; metadata: any },
    ) => {
      try {
        if (!input.sessionID) {
          await writeLog("WARN", "tool.execute.after missing sessionID", { tool: input.tool })
          return
        }
        if (!isMempalaceTool(input.tool)) return
        const state = getSessionState(input.sessionID)
        if (state.status !== AutosaveStatus.Running) return
        const metadataSessionId = getMetadataSessionId(output.metadata)
        if (metadataSessionId && metadataSessionId !== input.sessionID) return
        if (!isSuccessfulToolOutput(output)) return
        if (!shouldCountSuccessfulTool(input.sessionID, input.tool, input.callID)) return
        recordSuccessfulTool(input.sessionID, input.tool, input.callID)
        await writeLog("INFO", "observed mempalace tool during autosave", {
          sessionId: input.sessionID,
          tool: input.tool,
          count: getSessionState(input.sessionID).successfulToolCalls.length,
        })
      } catch (error) {
        await writeLog("ERROR", "tool.execute.after hook failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
