import crypto from "node:crypto"
import { sanitizeText } from "./derive"
import { stripPrivateContent } from "./privacy"

export enum AutosaveReason {
  Idle = "idle",
  Compacted = "compacted",
  Error = "error",
}
export enum AutosaveStatus {
  Idle = "idle",
  Pending = "pending",
  Running = "running",
  Saved = "saved",
  Noop = "noop",
  Failed = "failed",
}

export type SessionAutosaveState = {
  status: AutosaveStatus
  pendingReason?: AutosaveReason
  retrievalPending: boolean
  pendingRetrievalUserDigest?: string
  keywordSavePending: boolean
  pendingUserDigest?: string
  pendingTranscriptDigest?: string
  lastHandledUserDigest?: string
  lastHandledTranscriptDigest?: string
  successfulToolCalls: string[]
  successfulToolCallIds: string[]
  mutationToolCallIds: string[]
  runningSince?: number
  lastToolCallAt?: number
  lastRetrievedUserDigest?: string
  retryCount: number
  lastFailureAt?: number
  updatedAt: number
}

const states = new Map<string, SessionAutosaveState>()
let currentTurnSessionId: string | undefined
const MAX_SESSIONS = 200
const STATE_TTL_MS = 1000 * 60 * 60 * 12
const RETRY_COOLDOWN_MS = 1000 * 30
const MAX_RETRIES = 2

const extractTextParts = (message: any) => {
  const parts: string[] = []
  if (!message) return parts
  if (typeof message.content === "string") parts.push(message.content)
  if (Array.isArray(message.parts)) {
    for (const part of message.parts) {
      if (!part) continue
      if (typeof part.text === "string") parts.push(part.text)
      if (typeof part.content === "string") parts.push(part.content)
    }
  }
  if (message.info && typeof message.info?.content === "string") {
    parts.push(message.info.content)
  }
  return parts
}

const extractRole = (message: any) => message?.role || message?.info?.role || "unknown"

const fingerprint = (chunks: string[]) => {
  return crypto.createHash("sha256").update(JSON.stringify(chunks), "utf8").digest("hex").slice(0, 16)
}

export const buildUserDigest = (messages: any[]) => {
  const normalized = (messages || [])
    .filter((message) => extractRole(message) === "user")
    .slice(-20)
    .map((message) => extractTextParts(message).map((part) => sanitizeText(part)).join("\n"))
  return fingerprint(normalized)
}

export const buildTranscriptDigest = (messages: any[]) => {
  const normalized = (messages || []).slice(-50).map((message) => {
    const role = extractRole(message)
    const text = extractTextParts(message).map((part) => sanitizeText(part)).join("\n")
    return `${role}:${text}`
  })
  return fingerprint(normalized)
}

const createState = (): SessionAutosaveState => ({
  status: AutosaveStatus.Idle,
  successfulToolCalls: [],
  successfulToolCallIds: [],
  mutationToolCallIds: [],
  retryCount: 0,
  retrievalPending: true,
  keywordSavePending: false,
  updatedAt: Date.now(),
})

export const getSessionState = (sessionId: string) => {
  evictExpiredStates()
  const existing = states.get(sessionId)
  if (existing) {
    existing.updatedAt = Date.now()
    return existing
  }
  const state = createState()
  states.set(sessionId, state)
  evictOverflowStates()
  return state
}

export const setCurrentTurnSessionId = (sessionId: string | undefined) => {
  currentTurnSessionId = sessionId
}

export const getCurrentTurnSessionId = () => currentTurnSessionId

const evictExpiredStates = () => {
  const now = Date.now()
  for (const [sessionId, state] of states) {
    if (now - state.updatedAt > STATE_TTL_MS) states.delete(sessionId)
  }
}

const evictOverflowStates = () => {
  if (states.size <= MAX_SESSIONS) return
  const sorted = [...states.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)
  for (const [sessionId] of sorted.slice(0, states.size - MAX_SESSIONS)) {
    states.delete(sessionId)
  }
}

export const resetAllStates = () => {
  states.clear()
  currentTurnSessionId = undefined
}

export const markPending = (
  sessionId: string,
  reason: AutosaveReason,
  userDigest: string,
  transcriptDigest: string,
) => {
  const state = getSessionState(sessionId)
  state.status = AutosaveStatus.Pending
  state.pendingReason = reason
  state.pendingUserDigest = userDigest
  state.pendingTranscriptDigest = transcriptDigest
  state.successfulToolCalls = []
  state.successfulToolCallIds = []
  state.mutationToolCallIds = []
  state.updatedAt = Date.now()
}

export const markRetrievalInjected = (sessionId: string) => {
  const state = getSessionState(sessionId)
  state.retrievalPending = false
  state.lastRetrievedUserDigest = state.pendingRetrievalUserDigest
  state.pendingRetrievalUserDigest = undefined
  state.updatedAt = Date.now()
}

export const markRetrievalPending = (sessionId: string, userDigest: string) => {
  const state = getSessionState(sessionId)
  if (state.lastRetrievedUserDigest === userDigest) return
  if (state.pendingRetrievalUserDigest === userDigest && state.retrievalPending) return
  state.retrievalPending = true
  state.pendingRetrievalUserDigest = userDigest
  state.updatedAt = Date.now()
}

export const markKeywordSavePending = (sessionId: string) => {
  const state = getSessionState(sessionId)
  state.keywordSavePending = true
  state.updatedAt = Date.now()
}

export const clearKeywordSavePending = (sessionId: string) => {
  const state = getSessionState(sessionId)
  state.keywordSavePending = false
  state.updatedAt = Date.now()
}

export const extractLastUserMessage = (messages: any[]) => {
  const userMessages = (messages || []).filter((message) => extractRole(message) === "user")
  const last = userMessages.at(-1)
  const text = extractTextParts(last).map((part) => stripPrivateContent(part)).join("\n").trim()
  return text
}

export const startAutosave = (sessionId: string) => {
  const state = getSessionState(sessionId)
  state.status = AutosaveStatus.Running
  state.successfulToolCalls = []
  state.successfulToolCallIds = []
  state.mutationToolCallIds = []
  state.runningSince = Date.now()
  state.updatedAt = Date.now()
}

export const markMutationToolCall = (sessionId: string, callId?: string) => {
  if (!callId) return
  const state = getSessionState(sessionId)
  if (!state.mutationToolCallIds.includes(callId)) {
    state.mutationToolCallIds.push(callId)
    state.updatedAt = Date.now()
  }
}

export const shouldCountSuccessfulTool = (sessionId: string, tool: string, callId?: string) => {
  const state = getSessionState(sessionId)
  if (tool === "mempalace_memory") {
    return !!callId && state.mutationToolCallIds.includes(callId)
  }
  return false
}

export const recordSuccessfulTool = (sessionId: string, tool: string, callId?: string) => {
  const state = getSessionState(sessionId)
  if (callId && state.successfulToolCallIds.includes(callId)) return
  if (!state.successfulToolCalls.includes(tool)) state.successfulToolCalls.push(tool)
  if (callId) state.successfulToolCallIds.push(callId)
  state.lastToolCallAt = Date.now()
  state.updatedAt = Date.now()
}

export const finalizeAutosave = (sessionId: string) => {
  const state = getSessionState(sessionId)
  if (state.status !== AutosaveStatus.Running) return state
  const succeeded =
    state.successfulToolCalls.length > 0 &&
    (!state.runningSince || (state.lastToolCallAt != null && state.lastToolCallAt >= state.runningSince))
  state.status = succeeded ? AutosaveStatus.Saved : AutosaveStatus.Noop
  state.lastHandledUserDigest = state.pendingUserDigest
  state.lastHandledTranscriptDigest = state.pendingTranscriptDigest
  state.retryCount = succeeded ? 0 : state.retryCount
  state.pendingReason = undefined
  state.pendingUserDigest = undefined
  state.pendingTranscriptDigest = undefined
  state.successfulToolCalls = []
  state.successfulToolCallIds = []
  state.mutationToolCallIds = []
  state.runningSince = undefined
  state.lastToolCallAt = undefined
  state.updatedAt = Date.now()
  return state
}

export const markFailed = (sessionId: string) => {
  const state = getSessionState(sessionId)
  state.status = AutosaveStatus.Failed
  state.retryCount += 1
  state.lastFailureAt = Date.now()
  state.pendingReason = undefined
  state.pendingUserDigest = undefined
  state.pendingTranscriptDigest = undefined
  state.successfulToolCalls = []
  state.successfulToolCallIds = []
  state.mutationToolCallIds = []
  state.runningSince = undefined
  state.lastToolCallAt = undefined
  state.updatedAt = Date.now()
  return state
}

export const shouldScheduleAutosave = (
  sessionId: string,
  userDigest: string,
  transcriptDigest: string,
) => {
  const state = getSessionState(sessionId)
  if (state.status === AutosaveStatus.Pending || state.status === AutosaveStatus.Running) return false
  if (state.status === AutosaveStatus.Failed) {
    if (state.retryCount >= MAX_RETRIES) return false
    if (state.lastFailureAt && Date.now() - state.lastFailureAt < RETRY_COOLDOWN_MS) return false
  }
  if (state.lastHandledUserDigest === userDigest) return false
  if (state.lastHandledTranscriptDigest === transcriptDigest) return false
  return true
}
