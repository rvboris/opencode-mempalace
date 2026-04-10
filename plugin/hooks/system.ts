import {
  clearKeywordSavePending,
  extractLastUserMessage,
  getCurrentTurnSessionId,
  getSessionState,
  markRetrievalInjected,
} from "../lib/autosave"
import { loadConfig } from "../lib/config"
import { buildKeywordSaveInstruction, buildRetrievalInstruction } from "../lib/context"
import { writeLog } from "../lib/log"
import type { SystemHookContext } from "../lib/types"

const getProjectName = (project: unknown) => {
  return typeof project === "object" && project !== null && "name" in project && typeof project.name === "string"
    ? project.name
    : undefined
}

export const systemHooks = (ctx: SystemHookContext) => {
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
        const messages = Array.isArray(response)
          ? response
          : response && "data" in response && Array.isArray(response.data)
            ? response.data
            : []
        const lastUserMessage = extractLastUserMessage(messages)

        if (config.retrievalEnabled && state.retrievalPending && lastUserMessage) {
          output.system.push(
            buildRetrievalInstruction({
              projectName: getProjectName(ctx.project),
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
      } catch (error) {
        await writeLog("ERROR", "system transform hook failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
