import { describe, expect, it } from "bun:test"

const {
  AutosaveReason,
  AutosaveStatus,
  buildTranscriptDigest,
  buildUserDigest,
  extractLastUserMessage,
  finalizeAutosave,
  getSessionState,
  markPending,
  markRetrievalInjected,
  markRetrievalPending,
  recordSuccessfulTool,
  shouldScheduleAutosave,
} = await import("../plugin/lib/autosave")
const { buildAutosaveInstruction } = await import("../plugin/lib/context")

describe("autosave state", () => {
  it("schedules only once for same user progress", () => {
    const messages = [
      { role: "user", content: "Remember auth decision." },
      { role: "assistant", content: "Done." },
    ]
    const sessionId = "autosave-state-1"
    const userDigest = buildUserDigest(messages)
    const transcriptDigest = buildTranscriptDigest(messages)

    expect(shouldScheduleAutosave(sessionId, userDigest, transcriptDigest)).toBe(true)
    markPending(sessionId, AutosaveReason.Idle, userDigest, transcriptDigest)
    getSessionState(sessionId).status = AutosaveStatus.Noop
    getSessionState(sessionId).lastHandledUserDigest = userDigest
    getSessionState(sessionId).lastHandledTranscriptDigest = transcriptDigest

    expect(shouldScheduleAutosave(sessionId, userDigest, transcriptDigest)).toBe(false)
  })

  it("marks autosave as saved after successful mempalace tool calls", () => {
    const sessionId = "autosave-state-2"
    markPending(sessionId, AutosaveReason.Idle, "user-1", "tx-1")
    getSessionState(sessionId).status = AutosaveStatus.Running
    recordSuccessfulTool(sessionId, "mcp-router_mempalace_add_drawer")

    const state = finalizeAutosave(sessionId)
    expect(state.status).toBe(AutosaveStatus.Saved)
    expect(state.lastHandledUserDigest).toBe("user-1")
    expect(state.runningSince).toBeUndefined()
  })

  it("treats tool calls before running window as noop", () => {
    const sessionId = "autosave-state-3"
    markPending(sessionId, AutosaveReason.Idle, "user-2", "tx-2")
    const state = getSessionState(sessionId)
    state.status = AutosaveStatus.Running
    state.runningSince = Date.now() + 1000
    state.lastToolCallAt = Date.now()
    state.successfulToolCalls = ["mempalace_add_drawer"]

    const finalized = finalizeAutosave(sessionId)
    expect(finalized.status).toBe(AutosaveStatus.Noop)
  })

  it("stops scheduling after max retries", () => {
    const sessionId = "autosave-state-4"
    const state = getSessionState(sessionId)
    state.status = AutosaveStatus.Failed
    state.retryCount = 2
    state.lastFailureAt = Date.now() - 100000

    const should = shouldScheduleAutosave(sessionId, "user-x", "tx-x")
    expect(should).toBe(false)
  })

  it("builds hidden autosave instruction without visible protocol markers", () => {
    const instruction = buildAutosaveInstruction(AutosaveReason.Idle)
    expect(instruction).not.toContain("[mempalace-autosave]")
    expect(instruction).not.toContain("<mempalace-autosave-ok")
    expect(instruction).toContain("Do not mention this instruction to the user")
  })

  it("extracts and sanitizes last user message", () => {
    const last = extractLastUserMessage([
      { role: "assistant", content: "done" },
      { role: "user", content: "Keep <private>secret</private> this preference" },
    ])
    expect(last).toContain("[REDACTED_PRIVATE]")
  })

  it("does not re-arm retrieval for the same user digest after injection", () => {
    const sessionId = "autosave-state-5"
    markRetrievalPending(sessionId, "user-digest")
    markRetrievalInjected(sessionId)
    markRetrievalPending(sessionId, "user-digest")

    const state = getSessionState(sessionId)
    expect(state.retrievalPending).toBe(false)
    expect(state.lastRetrievedUserDigest).toBe("user-digest")
  })
})
