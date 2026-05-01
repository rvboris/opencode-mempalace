import {
  AutosaveReason,
  AutosaveStatus,
  buildMessageSnapshot,
  getMessageSnapshot,
  getSessionState,
  markAutosaveComplete,
  markKeywordSavePending,
  markFailed,
  markRetrievalPending,
  setMessageSnapshot,
  shouldScheduleAutosave,
} from "../lib/autosave"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { COMPACTION_CONTEXT_MESSAGE, DEFAULT_AGENT_NAME, LOG_MESSAGES } from "../lib/constants"
import { sanitizeText } from "../lib/derive"
import { getProjectName, loadSessionMessages } from "../lib/opencode"
import { redactSecrets } from "../lib/privacy"
import { getProjectScope } from "../lib/scope"
import { recordAutosave } from "../lib/status"
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

const getSessionId = (event: SessionEvent) => {
  const properties = event.properties as { sessionID?: string; info?: { id?: string } } | undefined
  return properties?.sessionID ?? properties?.info?.id
}

const toReason = (eventType: string): AutosaveReason => {
  if (eventType === "session.compacted") return AutosaveReason.Compacted
  if (eventType === "session.error") return AutosaveReason.Error
  return AutosaveReason.Idle
}

export const eventHooks = (ctx: EventHookContext) => {
  return {
    event: async ({ event }: { event: SessionEvent }) => {
      try {
        if (!isTrackedEventType(event.type)) return

        const sessionId = getSessionId(event)
        if (!sessionId) {
          await writeLog("WARN", LOG_MESSAGES.autosaveEventMissingSessionId, { eventType: event.type })
          return
        }

        const config = await loadConfig()
        if (event.type === "session.updated" || event.type === "message.updated") {
          const snapshot = buildMessageSnapshot(await loadSessionMessages(ctx.client, sessionId))
          setMessageSnapshot(sessionId, snapshot)
          if (config.retrievalEnabled) {
            markRetrievalPending(sessionId, snapshot.userDigest)
          }
          const lastUserMessage = snapshot.lastUserMessage
          if (lastUserMessage && config.keywordSaveEnabled && config.keywordPatterns.length) {
            const keywordPattern = new RegExp(`\\b(${config.keywordPatterns.map(escapeRegex).join("|")})\\b`, "i")
            if (config.keywordSaveEnabled && keywordPattern.test(lastUserMessage)) {
              markKeywordSavePending(sessionId)
              await writeLog("INFO", LOG_MESSAGES.keywordTriggeredAutosaveHintDetected, { sessionId })
            }
          }
        }

        if (!isAutosaveTriggerEventType(event.type)) return

        await writeLog("INFO", LOG_MESSAGES.autosaveTriggerReceived, {
          eventType: event.type,
          sessionId,
        })

        if (event.type === "session.error") {
          const failed = markFailed(sessionId)
          await recordAutosave({
            sessionId,
            outcome: "failed",
            reason: toReason(event.type),
            sourcePreview: getMessageSnapshot(sessionId)?.lastUserMessage,
          })
          await writeLog("ERROR", LOG_MESSAGES.autosaveFailedOnSessionError, {
            sessionId,
            retryCount: failed.retryCount,
          })
          return
        }

        if (!config.autosaveEnabled) return

        const cachedSnapshot = getMessageSnapshot(sessionId)
        const snapshot = cachedSnapshot ?? buildMessageSnapshot(await loadSessionMessages(ctx.client, sessionId))
        if (!cachedSnapshot) {
          setMessageSnapshot(sessionId, snapshot)
        }

        const { transcript, transcriptDigest, userDigest } = snapshot
        if (!shouldScheduleAutosave(sessionId, userDigest, transcriptDigest)) {
          await recordAutosave({
            sessionId,
            outcome: "skipped",
            reason: toReason(event.type),
            sourcePreview: snapshot.lastUserMessage,
          })
          await writeLog("INFO", LOG_MESSAGES.skippingAutosaveState, {
            sessionId,
            reason: toReason(event.type),
            userDigest,
            transcriptDigest,
            status: getSessionState(sessionId).status,
          })
          return
        }

        const sanitizedTranscript = sanitizeText(redactSecrets(transcript))
        if (!sanitizedTranscript.trim()) {
          markAutosaveComplete(sessionId, userDigest, transcriptDigest, AutosaveStatus.Noop)
          await recordAutosave({
            sessionId,
            outcome: "skipped",
            reason: toReason(event.type),
            sourcePreview: snapshot.lastUserMessage,
          })
          await writeLog("INFO", LOG_MESSAGES.autosaveSkippedEmptyTranscript, { sessionId })
          return
        }

        const wing = getProjectScope(getProjectName(ctx.project), config.projectWingPrefix).wing
        const result = await executeAdapter(ctx.$, {
          mode: "mine_messages",
          transcript: sanitizedTranscript,
          wing,
          extract_mode: config.autoMineExtractMode,
          agent: DEFAULT_AGENT_NAME,
        })

        if (result?.success === false) {
          const failed = markFailed(sessionId)
          await recordAutosave({
            sessionId,
            outcome: "failed",
            reason: toReason(event.type),
            wing,
            sourcePreview: snapshot.lastUserMessage,
          })
          await writeLog("ERROR", LOG_MESSAGES.autosaveMiningFailed, {
            sessionId,
            retryCount: failed.retryCount,
            result,
          })
          return
        }

        const completed = markAutosaveComplete(sessionId, userDigest, transcriptDigest, AutosaveStatus.Saved)
        await recordAutosave({
          sessionId,
          outcome: "saved",
          reason: toReason(event.type),
          wing,
          sourcePreview: snapshot.lastUserMessage,
        })
        await writeLog("INFO", LOG_MESSAGES.autosaveMinedSessionContext, {
          sessionId,
          reason: toReason(event.type),
          userDigest,
          transcriptDigest,
          status: completed.status,
          wing,
        })
      } catch (error) {
        await writeLog("ERROR", LOG_MESSAGES.eventHookFailed, {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    "experimental.session.compacting": async (
      input: { sessionID?: string },
      output: { context: string[]; prompt?: string },
      ) => {
      if (!input.sessionID) {
        await writeLog("WARN", LOG_MESSAGES.compactionHookMissingSessionId, {})
        return
      }
      output.context.push(COMPACTION_CONTEXT_MESSAGE)
      await writeLog("INFO", LOG_MESSAGES.injectedCompactionAutosaveContext, {
        sessionId: input.sessionID,
        reason: AutosaveReason.Compacted,
      })
    },
  }
}
