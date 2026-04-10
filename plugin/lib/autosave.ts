import crypto from "node:crypto"
import { sanitizeText } from "./derive"
import { stripPrivateContent } from "./privacy"
import { MAX_USER_MESSAGES_DIGEST, MAX_TRANSCRIPT_MESSAGES_DIGEST } from "./constants"
import type { MessageLike } from "./types"

export enum AutosaveReason {
  Idle = "idle",
  Compacted = "compacted",
  Error = "error",
}
export enum AutosaveStatus {
  Idle = "idle",
  Saved = "saved",
  Noop = "noop",
  Failed = "failed",
}

export type SessionAutosaveState = {
  status: AutosaveStatus
  retrievalPending: boolean
  pendingRetrievalUserDigest?: string
  keywordSavePending: boolean
  lastHandledUserDigest?: string
  lastHandledTranscriptDigest?: string
  lastRetrievedUserDigest?: string
  retryCount: number
  lastFailureAt?: number
  messageSnapshot?: SessionMessageSnapshot
  updatedAt: number
}

export type SessionMessageSnapshot = {
  userDigest: string
  transcriptDigest: string
  lastUserMessage: string
  transcript: string
}

const states = new Map<string, SessionAutosaveState>()
const MAX_SESSIONS = 200
const STATE_TTL_MS = 1000 * 60 * 60 * 12
const RETRY_COOLDOWN_MS = 1000 * 30
const MAX_RETRIES = 2

const extractTextParts = (message: MessageLike | null | undefined) => {
  const parts: string[] = []
  if (!message) return parts
  if (typeof message.content === "string") parts.push(message.content)
  for (const part of message.parts ?? []) {
    if ("text" in part && typeof part.text === "string") parts.push(part.text)
    if ("content" in part && typeof part.content === "string") parts.push(part.content)
  }
  if (message.info && "content" in message.info && typeof message.info.content === "string") {
    parts.push(message.info.content)
  }
  return parts
}

const extractRole = (message: MessageLike | null | undefined) => message?.role ?? message?.info?.role ?? "unknown"

const fingerprint = (chunks: string[]) => {
  return crypto.createHash("sha256").update(JSON.stringify(chunks), "utf8").digest("hex").slice(0, 16)
}

export const buildUserDigest = (messages: readonly MessageLike[] | null | undefined) => {
  const normalized = (messages ?? [])
    .filter((message) => extractRole(message) === "user")
    .slice(-MAX_USER_MESSAGES_DIGEST)
    .map((message) => extractTextParts(message).map((part) => sanitizeText(part)).join("\n"))
  return fingerprint(normalized)
}

export const buildTranscriptDigest = (messages: readonly MessageLike[] | null | undefined) => {
  const normalized = (messages ?? []).slice(-MAX_TRANSCRIPT_MESSAGES_DIGEST).map((message) => {
    const role = extractRole(message)
    const text = extractTextParts(message).map((part) => sanitizeText(part)).join("\n")
    return `${role}:${text}`
  })
  return fingerprint(normalized)
}

export const buildMessageSnapshot = (messages: readonly MessageLike[] | null | undefined): SessionMessageSnapshot => {
  return {
    userDigest: buildUserDigest(messages),
    transcriptDigest: buildTranscriptDigest(messages),
    lastUserMessage: extractLastUserMessage(messages),
    transcript: buildTranscriptText(messages),
  }
}

const createState = (): SessionAutosaveState => ({
  status: AutosaveStatus.Idle,
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
}

export const markAutosaveComplete = (
  sessionId: string,
  userDigest: string,
  transcriptDigest: string,
  status: AutosaveStatus.Saved | AutosaveStatus.Noop,
) => {
  const state = getSessionState(sessionId)
  state.status = status
  state.lastHandledUserDigest = userDigest
  state.lastHandledTranscriptDigest = transcriptDigest
  if (status === AutosaveStatus.Saved) {
    state.retryCount = 0
  }
  state.updatedAt = Date.now()
  return state
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

export const setMessageSnapshot = (sessionId: string, snapshot: SessionMessageSnapshot) => {
  const state = getSessionState(sessionId)
  state.messageSnapshot = snapshot
  state.updatedAt = Date.now()
}

export const getMessageSnapshot = (sessionId: string) => {
  return getSessionState(sessionId).messageSnapshot
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

export const extractLastUserMessage = (messages: readonly MessageLike[] | null | undefined) => {
  const userMessages = (messages ?? []).filter((message) => extractRole(message) === "user")
  const last = userMessages.at(-1)
  const text = extractTextParts(last).map((part) => stripPrivateContent(part)).join("\n").trim()
  return text
}

export const markFailed = (sessionId: string) => {
  const state = getSessionState(sessionId)
  state.status = AutosaveStatus.Failed
  state.retryCount += 1
  state.lastFailureAt = Date.now()
  state.updatedAt = Date.now()
  return state
}

export const shouldScheduleAutosave = (
  sessionId: string,
  userDigest: string,
  transcriptDigest: string,
) => {
  const state = getSessionState(sessionId)
  if (state.status === AutosaveStatus.Failed) {
    if (state.retryCount >= MAX_RETRIES) return false
    if (state.lastFailureAt && Date.now() - state.lastFailureAt < RETRY_COOLDOWN_MS) return false
  }
  if (state.lastHandledUserDigest === userDigest) return false
  if (state.lastHandledTranscriptDigest === transcriptDigest) return false
  return true
}

export const buildTranscriptText = (messages: readonly MessageLike[] | null | undefined) => {
  const lines: string[] = []
  for (const message of messages ?? []) {
    const role = extractRole(message)
    const text = extractTextParts(message).map((part) => stripPrivateContent(part)).join("\n").trim()
    if (!text) continue
    lines.push(`${role.toUpperCase()}: ${text}`)
  }
  return lines.join("\n\n")
}
