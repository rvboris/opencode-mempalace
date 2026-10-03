import {
  buildMessageSnapshot,
  clearKeywordSavePending,
  getMessageSnapshot,
  getSessionState,
  markRetrievalInjected,
  markRetrievalPending,
  markKeywordSavePending,
  setMessageSnapshot,
} from "../lib/autosave"
import { loadConfig } from "../lib/config"
import { LOG_MESSAGES } from "../lib/constants"
import { buildKeywordSaveInstruction, buildRetrievalInstruction } from "../lib/context"
import { writeLog } from "../lib/log"
import { getProjectName, loadSessionMessages } from "../lib/opencode"
import { recordRetrievalPrompt } from "../lib/status"
import type { SystemHookContext } from "../lib/types"

export const systemHooks = async (
  ctx: SystemHookContext,
  input: { sessionID: string },
  output: { system: { type: "text"; text: string }[] },
) => {
      try {
        const sessionId = input.sessionID
        const config = await loadConfig()
        const state = getSessionState(sessionId)
        const snapshot = buildMessageSnapshot(await loadSessionMessages(ctx, sessionId))
        setMessageSnapshot(sessionId, snapshot)
        const lastUserMessage = snapshot.lastUserMessage
        if (config.retrievalEnabled) markRetrievalPending(sessionId, snapshot.userDigest)
        if (lastUserMessage && config.keywordSaveEnabled && config.keywordPatterns.length) {
          const pattern = new RegExp(`\\b(${config.keywordPatterns.map((value) => value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")).join("|")})\\b`, "i")
          if (pattern.test(lastUserMessage)) markKeywordSavePending(sessionId)
        }

        if (config.retrievalEnabled && state.lastRetrievedUserDigest !== snapshot.userDigest && lastUserMessage) {
          markRetrievalPending(sessionId, snapshot.userDigest)
          output.system.push({ type: "text", text: buildRetrievalInstruction({
              projectName: getProjectName(ctx.location.project),
              projectWingPrefix: config.projectWingPrefix,
              userWingPrefix: config.userWingPrefix,
              maxInjectedItems: config.maxInjectedItems,
              retrievalQueryLimit: config.retrievalQueryLimit,
              lastUserMessage,
            }) })

          markRetrievalInjected(sessionId)
          await recordRetrievalPrompt({ sessionId, queryPreview: lastUserMessage })
          await writeLog("INFO", LOG_MESSAGES.injectedRetrievalInstruction, { sessionId })
        }

        if (lastUserMessage && config.keywordSaveEnabled && config.keywordPatterns.length && state.lastKeywordSavedUserDigest !== snapshot.userDigest) {
          const pattern = new RegExp(`\\b(${config.keywordPatterns.map((value) => value.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")).join("|")})\\b`, "i")
          if (pattern.test(lastUserMessage)) {
            output.system.push({ type: "text", text: buildKeywordSaveInstruction() })
            state.lastKeywordSavedUserDigest = snapshot.userDigest
          }
          clearKeywordSavePending(sessionId)
          if (state.lastKeywordSavedUserDigest === snapshot.userDigest) await writeLog("INFO", LOG_MESSAGES.injectedKeywordSaveInstruction, { sessionId })
        }
      } catch (error) {
        await writeLog("ERROR", LOG_MESSAGES.systemTransformHookFailed, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
}
