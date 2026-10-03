import {
  AutosaveReason,
  AutosaveStatus,
  buildAutosaveMiningTranscript,
  buildMessageSnapshot,
  getMessageSnapshot,
  getSessionState,
  markAutosaveComplete,
  markKeywordSavePending,
  markFailed,
  markRetrievalPending,
  setPendingCompactionSnapshot,
  takePendingCompactionSnapshot,
  setMessageSnapshot,
  shouldScheduleAutosave,
} from "../lib/autosave"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { DEFAULT_AGENT_NAME, LOG_MESSAGES } from "../lib/constants"
import { sanitizeText, stripJudgeTag, parseJudgeTag } from "../lib/derive"
import { getProjectName, loadSessionMessages } from "../lib/opencode"
import { redactSecrets } from "../lib/privacy"
import { getProjectScope } from "../lib/scope"
import { recordAutosave, recordRetrievalJudge } from "../lib/status"
import { writeLog } from "../lib/log"
import { SESSION_EVENT_TYPES, type EventHookContext, type SessionEvent, type SessionEventType } from "../lib/types"

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const AUTOSAVE_TRIGGER_EVENT_TYPES = new Set<string>([
  "session.idle",
  "session.compaction.ended",
  "session.deleted",
  "session.execution.failed",
])
const TRACKED_EVENT_TYPES = new Set<string>([...SESSION_EVENT_TYPES, ...AUTOSAVE_TRIGGER_EVENT_TYPES])

const isTrackedEventType = (value: string): value is string => TRACKED_EVENT_TYPES.has(value)

const isAutosaveTriggerEventType = (value: string): value is SessionEventType => {
  return AUTOSAVE_TRIGGER_EVENT_TYPES.has(value as SessionEventType)
}

const getSessionId = (event: SessionEvent) => "sessionID" in event.data ? event.data.sessionID : undefined

const toReason = (eventType: string): AutosaveReason => {
  if (eventType === "session.compaction.ended") return AutosaveReason.Compacted
  if (eventType === "session.execution.failed") return AutosaveReason.Error
  return AutosaveReason.Idle
}

export const eventHooks = async (ctx: EventHookContext, event: import("@opencode/client/promise").OpenCodeEvent) => {
      try {
        if (!isTrackedEventType(event.type)) return

        const sessionId = getSessionId(event)
        if (!sessionId) {
          await writeLog("WARN", LOG_MESSAGES.autosaveEventMissingSessionId, { eventType: event.type })
          return
        }

        const config = await loadConfig()
        const state = getSessionState(sessionId)
        if (event.type === "session.step.ended") {
          const completed = buildMessageSnapshot(await loadSessionMessages(ctx, sessionId))
          setMessageSnapshot(sessionId, completed)
          return
        }
        const pendingCompaction = event.type === "session.compaction.ended" ? getSessionState(sessionId).pendingCompactionSnapshot : undefined
        let idleSnapshot = event.type === "session.idle" ? undefined : event.type === "session.compaction.ended" ? pendingCompaction : getMessageSnapshot(sessionId)
        if (event.type === "session.idle") {
          idleSnapshot = buildMessageSnapshot(await loadSessionMessages(ctx, sessionId))
          setMessageSnapshot(sessionId, idleSnapshot)
          if (config.retrievalEnabled && state.lastRetrievedUserDigest !== idleSnapshot.userDigest) markRetrievalPending(sessionId, idleSnapshot.userDigest)
          const lastUserMessage = idleSnapshot.lastUserMessage
          if (lastUserMessage && config.keywordSaveEnabled && config.keywordPatterns.length && state.lastKeywordSavedUserDigest !== idleSnapshot.userDigest) {
            const keywordPattern = new RegExp(`\\b(${config.keywordPatterns.map(escapeRegex).join("|")})\\b`, "i")
            if (keywordPattern.test(lastUserMessage)) markKeywordSavePending(sessionId)
          }
        }

        if (!isAutosaveTriggerEventType(event.type)) return

        if (event.type === "session.idle" && idleSnapshot && state.lastRetrievedUserDigest === idleSnapshot.userDigest && state.lastJudgedUserDigest !== idleSnapshot.userDigest) {
          const messages = await loadSessionMessages(ctx, sessionId)
          let lastUserIndex = -1
          messages.forEach((message, index) => {
            if (message.role === "user") lastUserIndex = index
          })
          const answer = messages.slice(lastUserIndex + 1).filter((message) => message.role === "assistant").at(-1)?.content ?? ""
          const verdict = (parseJudgeTag(answer) ?? "unknown") as "none" | "cited" | "improved" | "saved-time" | "unknown"
          await recordRetrievalJudge({ sessionId, verdict })
          state.lastJudgedUserDigest = idleSnapshot.userDigest
        }

        await writeLog("INFO", LOG_MESSAGES.autosaveTriggerReceived, {
          eventType: event.type,
          sessionId,
        })

        if (event.type === "session.execution.failed") {
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
        const snapshot = pendingCompaction ?? (event.type === "session.compaction.ended" || event.type === "session.deleted"
          ? cachedSnapshot ?? buildMessageSnapshot([])
          : idleSnapshot ?? buildMessageSnapshot(await loadSessionMessages(ctx, sessionId)))
        if (event.type === "session.compaction.ended" && pendingCompaction) takePendingCompactionSnapshot(sessionId)
        setMessageSnapshot(sessionId, snapshot)

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

        const sanitizedTranscript = sanitizeText(redactSecrets(stripJudgeTag(transcript)))
        const miningTranscript = buildAutosaveMiningTranscript(sanitizedTranscript)
        if (!miningTranscript) {
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

        const wing = getProjectScope(getProjectName(ctx.location.project), config.projectWingPrefix).wing
        let result: Awaited<ReturnType<typeof executeAdapter>>
        try {
          result = await executeAdapter(undefined, {
          mode: "mine_messages",
          transcript: miningTranscript,
          wing,
          extract_mode: config.autoMineExtractMode,
          agent: DEFAULT_AGENT_NAME,
        })
        } catch (error) {
          const failed = markFailed(sessionId)
          await recordAutosave({ sessionId, outcome: "failed", reason: toReason(event.type), wing, sourcePreview: snapshot.lastUserMessage })
          await writeLog("ERROR", LOG_MESSAGES.autosaveMiningFailed, { sessionId, retryCount: failed.retryCount, error: String(error) })
          return
        }

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
        await writeLog("ERROR", LOG_MESSAGES.eventHookFailed, { error: error instanceof Error ? error.message : String(error) })
      }
}
