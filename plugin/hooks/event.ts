import {
  AutosaveReason,
  AutosaveStatus,
  buildTranscriptText,
  buildTranscriptDigest,
  buildUserDigest,
  extractLastUserMessage,
  getSessionState,
  markAutosaveComplete,
  markKeywordSavePending,
  markFailed,
  markRetrievalPending,
  shouldScheduleAutosave,
} from "../lib/autosave"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { redactSecrets } from "../lib/privacy"
import { getProjectScope } from "../lib/scope"
import { writeLog } from "../lib/log"
import { SESSION_EVENT_TYPES, type EventHookContext, type SessionEvent, type SessionEventType } from "../lib/types"

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const TRACKED_EVENT_TYPES = new Set<string>(SESSION_EVENT_TYPES)
const AUTOSAVE_TRIGGER_EVENT_TYPES = new Set<SessionEventType>([
  "session.idle",
  "session.compacted",
  "session.deleted",
  "session.error",
])

const isTrackedEventType = (value: string): value is SessionEventType => TRACKED_EVENT_TYPES.has(value)

const isAutosaveTriggerEventType = (value: string): value is SessionEventType => {
  return AUTOSAVE_TRIGGER_EVENT_TYPES.has(value as SessionEventType)
}

const getProjectName = (project: unknown) => {
  return typeof project === "object" && project !== null && "name" in project && typeof project.name === "string"
    ? project.name
    : undefined
}

const getSessionId = (event: SessionEvent) => {
  const properties = event.properties as { sessionID?: string; info?: { id?: string } } | undefined
  return properties?.sessionID ?? properties?.info?.id
}

const toReason = (eventType: string): AutosaveReason => {
  if (eventType === "session.compacted") return AutosaveReason.Compacted
  if (eventType === "session.error") return AutosaveReason.Error
  return AutosaveReason.Idle
}

const loadMessages = async (ctx: EventHookContext, sessionId: string) => {
  const response = await ctx.client.session.messages({ path: { id: sessionId } })
  if (Array.isArray(response)) return response
  if (response && "data" in response && Array.isArray(response.data)) return response.data
  return []
}

export const eventHooks = (ctx: EventHookContext) => {
  return {
    event: async ({ event }: { event: SessionEvent }) => {
      try {
        if (!isTrackedEventType(event.type)) return

        const sessionId = getSessionId(event)
        if (!sessionId) {
          await writeLog("WARN", "autosave event missing sessionID", { eventType: event.type })
          return
        }

        const config = await loadConfig()
        if (event.type === "session.updated" || event.type === "message.updated") {
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

        if (!isAutosaveTriggerEventType(event.type)) return

        await writeLog("INFO", "autosave trigger received", {
          eventType: event.type,
          sessionId,
        })

        if (event.type === "session.error") {
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
            reason: toReason(event.type),
            userDigest,
            transcriptDigest,
            status: getSessionState(sessionId).status,
          })
          return
        }

        const transcript = redactSecrets(buildTranscriptText(messages))
        if (!transcript.trim()) {
          markAutosaveComplete(sessionId, userDigest, transcriptDigest, AutosaveStatus.Noop)
          await writeLog("INFO", "autosave skipped empty transcript", { sessionId })
          return
        }

        const wing = getProjectScope(getProjectName(ctx.project), config.projectWingPrefix).wing
        const result = await executeAdapter(ctx.$, {
          mode: "mine_messages",
          transcript,
          wing,
          extract_mode: config.autoMineExtractMode,
          agent: "opencode",
        })

        if (result?.success === false) {
          const failed = markFailed(sessionId)
          await writeLog("ERROR", "autosave mining failed", {
            sessionId,
            retryCount: failed.retryCount,
            result,
          })
          return
        }

        const completed = markAutosaveComplete(sessionId, userDigest, transcriptDigest, AutosaveStatus.Saved)
        await writeLog("INFO", "autosave mined session context", {
          sessionId,
          reason: toReason(event.type),
          userDigest,
          transcriptDigest,
          status: completed.status,
          wing,
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
      output.context.push(
        "MemPalace retrieval may be useful after compaction. Search relevant project and user memory if needed before answering.",
      )
      await writeLog("INFO", "injected compaction autosave context", {
        sessionId: input.sessionID,
        reason: AutosaveReason.Compacted,
      })
    },
  }
}
