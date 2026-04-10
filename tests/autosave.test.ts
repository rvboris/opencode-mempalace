import { describe, expect, it } from "bun:test"

const {
  AutosaveStatus,
  buildTranscriptDigest,
  buildTranscriptText,
  buildUserDigest,
  extractLastUserMessage,
  getSessionState,
  markAutosaveComplete,
  markRetrievalInjected,
  markRetrievalPending,
  shouldScheduleAutosave,
} = await import("../plugin/lib/autosave")
const { buildAutosaveInstruction } = await import("../plugin/lib/context")

describe("autosave state", () => {
  it("schedules only once for same transcript progress", () => {
    const messages = [
      { role: "user", content: "Remember auth decision." },
      { role: "assistant", content: "Done." },
    ]
    const sessionId = "autosave-state-1"
    const userDigest = buildUserDigest(messages)
    const transcriptDigest = buildTranscriptDigest(messages)

    expect(shouldScheduleAutosave(sessionId, userDigest, transcriptDigest)).toBe(true)
    markAutosaveComplete(sessionId, userDigest, transcriptDigest, AutosaveStatus.Saved)
    expect(shouldScheduleAutosave(sessionId, userDigest, transcriptDigest)).toBe(false)
  })

  it("stops scheduling after max retries", () => {
    const sessionId = "autosave-state-2"
    const state = getSessionState(sessionId)
    state.status = AutosaveStatus.Failed
    state.retryCount = 2
    state.lastFailureAt = Date.now() - 100000

    expect(shouldScheduleAutosave(sessionId, "user-x", "tx-x")).toBe(false)
  })

  it("builds autosave instruction without visible protocol markers", () => {
    const instruction = buildAutosaveInstruction("idle")
    expect(instruction).not.toContain("[mempalace-autosave]")
    expect(instruction).not.toContain("<mempalace-autosave-ok")
  })

  it("extracts and sanitizes last user message", () => {
    const last = extractLastUserMessage([
      { role: "assistant", content: "done" },
      { role: "user", content: "Keep <private>secret</private> this preference" },
    ])
    expect(last).toContain("[REDACTED_PRIVATE]")
  })

  it("does not re-arm retrieval for the same user digest after injection", () => {
    const sessionId = "autosave-state-3"
    markRetrievalPending(sessionId, "user-digest")
    markRetrievalInjected(sessionId)
    markRetrievalPending(sessionId, "user-digest")

    const state = getSessionState(sessionId)
    expect(state.retrievalPending).toBe(false)
    expect(state.lastRetrievedUserDigest).toBe("user-digest")
  })

  it("builds transcript text with roles", () => {
    const transcript = buildTranscriptText([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ])
    expect(transcript).toContain("USER: Hello")
    expect(transcript).toContain("ASSISTANT: Hi")
  })
})
