import {
  AutosaveStatus,
  clearKeywordSavePending,
  extractLastUserMessage,
  getCurrentTurnSessionId,
  getSessionState,
  markRetrievalInjected,
  startAutosave,
} from "../lib/autosave"
import { loadConfig } from "../lib/config"
import { buildAutosaveInstruction, buildKeywordSaveInstruction, buildRetrievalInstruction } from "../lib/context"
import { writeLog } from "../lib/log"

type PluginContext = {
  client: any
  project: any
}

export const systemHooks = (ctx: PluginContext) => {
  return {
    "experimental.chat.system.transform": async (
      _input: {},
      output: { system: string[] },
    ) => {
      try {
        const sessionId = getCurrentTurnSessionId()
        if (!sessionId) return
        const config = await loadConfig()
        const state = getSessionState(sessionId)
        const response = await ctx.client.session.messages({ path: { id: sessionId } })
        const messages = response?.data ?? response ?? []
        const lastUserMessage = extractLastUserMessage(messages)

        if (config.retrievalEnabled && state.retrievalPending && lastUserMessage) {
          output.system.push(
            buildRetrievalInstruction({
              projectName: ctx.project?.name,
              projectWingPrefix: config.projectWingPrefix,
              userWingPrefix: config.userWingPrefix,
              maxInjectedItems: config.maxInjectedItems,
              retrievalQueryLimit: config.retrievalQueryLimit,
              lastUserMessage,
            }),
          )

          markRetrievalInjected(sessionId)
          await writeLog("INFO", "injected retrieval instruction", { sessionId })
        }

        if (state.keywordSavePending) {
          output.system.push(buildKeywordSaveInstruction())
          clearKeywordSavePending(sessionId)
          await writeLog("INFO", "injected keyword save instruction", { sessionId })
        }

        if (state.status !== AutosaveStatus.Pending || !state.pendingReason) return
        output.system.push(buildAutosaveInstruction(state.pendingReason))
        startAutosave(sessionId)
        await writeLog("INFO", "injected hidden autosave instruction", {
          sessionId,
          reason: state.pendingReason,
        })
      } catch (error) {
        await writeLog("ERROR", "system transform hook failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
