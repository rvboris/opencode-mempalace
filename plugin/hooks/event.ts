type PluginContext = {
  client: any
  project: any
  directory: string
  worktree: string
  $: any
}

import {
  AutosaveReason,
  AutosaveStatus,
  buildTranscriptDigest,
  buildUserDigest,
  extractLastUserMessage,
  finalizeAutosave,
  getSessionState,
  markKeywordSavePending,
  markFailed,
  markPending,
  markRetrievalPending,
  shouldScheduleAutosave,
} from "../lib/autosave"
import { loadConfig } from "../lib/config"
import { writeLog } from "../lib/log"

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const toReason = (eventType: string): AutosaveReason => {
  if (eventType === "session.compacted") return AutosaveReason.Compacted
  if (eventType === "session.error") return AutosaveReason.Error
  return AutosaveReason.Idle
}

const loadMessages = async (ctx: PluginContext, sessionId: string) => {
  const response = await ctx.client.session.messages({ path: { id: sessionId } })
  return response?.data ?? response ?? []
}

export const eventHooks = (ctx: PluginContext) => {
  return {
    event: async ({ event }: { event: any }) => {
      try {
        if (!["session.idle", "session.compacted", "session.error", "session.updated", "message.updated"].includes(event?.type)) return

        const sessionId = event?.properties?.sessionID
        if (!sessionId) {
          await writeLog("WARN", "autosave event missing sessionID", { eventType: event?.type })
          return
        }

        const config = await loadConfig()
        if (event?.type === "session.updated" || event?.type === "message.updated") {
          const messages = await loadMessages(ctx, sessionId)
          const userDigest = buildUserDigest(messages)
          if (config.retrievalEnabled) {
            markRetrievalPending(sessionId, userDigest)
          }
          const lastUserMessage = extractLastUserMessage(messages)
          if (lastUserMessage && config.keywordSaveEnabled && config.keywordPatterns.length) {
            const keywordPattern = new RegExp(`\\b(${config.keywordPatterns.map(escapeRegex).join("|")})\\b`, "i")
            if (config.keywordSaveEnabled && keywordPattern.test(lastUserMessage)) {
              markKeywordSavePending(sessionId)
              await writeLog("INFO", "keyword-triggered autosave hint detected", { sessionId })
            }
          }
        }

        if (!["session.idle", "session.compacted", "session.error"].includes(event?.type)) return

        await writeLog("INFO", "autosave trigger received", {
          eventType: event?.type,
          sessionId,
        })

        const state = getSessionState(sessionId)
        if (state.status === AutosaveStatus.Running && event?.type === "session.idle") {
          const finalized = finalizeAutosave(sessionId)
          await writeLog("INFO", "finalized autosave turn", {
            sessionId,
            status: finalized.status,
            toolCalls: finalized.successfulToolCalls.length,
          })
        }

        if (event?.type === "session.error") {
          const failed = markFailed(sessionId)
          await writeLog("ERROR", "autosave failed on session error", {
            sessionId,
            retryCount: failed.retryCount,
          })
          return
        }

        if (!config.autosaveEnabled) return

        const messages = await loadMessages(ctx, sessionId)
        const userDigest = buildUserDigest(messages)
        const transcriptDigest = buildTranscriptDigest(messages)
        if (!shouldScheduleAutosave(sessionId, userDigest, transcriptDigest)) {
          await writeLog("INFO", "skipping autosave state", {
            sessionId,
            reason: toReason(event?.type),
            userDigest,
            transcriptDigest,
            status: getSessionState(sessionId).status,
          })
          return
        }

        markPending(sessionId, toReason(event?.type), userDigest, transcriptDigest)
        await writeLog("INFO", "marked autosave pending", {
          sessionId,
          reason: toReason(event?.type),
          userDigest,
          transcriptDigest,
        })
      } catch (error) {
        await writeLog("ERROR", "event hook failed", {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    "experimental.session.compacting": async (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
    ) => {
      if (!input.sessionID) {
        await writeLog("WARN", "compaction hook missing sessionID", {})
        return
      }
      const state = getSessionState(input.sessionID)
      if (state.status !== AutosaveStatus.Pending) return
      output.context.push(
        "MemPalace autosave is pending. Before answering after compaction, persist durable facts, decisions, preferences, outcomes, and diary notes using MemPalace MCP tools. Do not dump the full transcript.",
      )
      await writeLog("INFO", "injected compaction autosave context", {
        sessionId: input.sessionID,
        reason: state.pendingReason,
      })
    },
  }
}
