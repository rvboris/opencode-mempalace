import {
  buildMessageSnapshot,
  clearKeywordSavePending,
  getMessageSnapshot,
  getSessionState,
  markRetrievalInjected,
  setMessageSnapshot,
} from "../lib/autosave"
import { loadConfig } from "../lib/config"
import { LOG_MESSAGES } from "../lib/constants"
import { buildKeywordSaveInstruction, buildRetrievalInstruction } from "../lib/context"
import { writeLog } from "../lib/log"
import { getProjectName, loadSessionMessages } from "../lib/opencode"
import type { SystemHookContext } from "../lib/types"

export const systemHooks = (ctx: SystemHookContext) => {
  return {
    "experimental.chat.system.transform": async (
      input: { sessionID?: string },
      output: { system: string[] },
    ) => {
      try {
        const sessionId = input.sessionID
        if (!sessionId) return
        const config = await loadConfig()
        const state = getSessionState(sessionId)
        const cachedSnapshot = getMessageSnapshot(sessionId)
        const snapshot = cachedSnapshot ?? buildMessageSnapshot(await loadSessionMessages(ctx.client, sessionId))
        if (!cachedSnapshot) {
          setMessageSnapshot(sessionId, snapshot)
        }
        const lastUserMessage = snapshot.lastUserMessage

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
          await writeLog("INFO", LOG_MESSAGES.injectedRetrievalInstruction, { sessionId })
        }

        if (state.keywordSavePending) {
          output.system.push(buildKeywordSaveInstruction())
          clearKeywordSavePending(sessionId)
          await writeLog("INFO", LOG_MESSAGES.injectedKeywordSaveInstruction, { sessionId })
        }
      } catch (error) {
        await writeLog("ERROR", LOG_MESSAGES.systemTransformHookFailed, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
  }
}
