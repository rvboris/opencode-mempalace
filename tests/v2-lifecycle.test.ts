import { describe, expect, it, mock } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import type { AdapterRequest } from "../plugin/lib/types"

const home = await fs.mkdtemp(path.join(os.tmpdir(), "mempalace-lifecycle-home-"))
process.env.HOME = home
process.env.MEMPALACE_STATUS_FILE = path.join(home, "status.json")
process.env.MEMPALACE_AUTOSAVE_LOG_FILE = path.join(home, "autosave.log")

const adapterCalls: AdapterRequest[] = []
let rejectAdapter = false
mock.module("../plugin/lib/adapter", () => ({
  executeAdapter: async (_shell: unknown, payload: AdapterRequest) => {
    adapterCalls.push(payload)
    if (rejectAdapter) throw new Error("adapter offline")
    return { success: true }
  },
}))
mock.module("../plugin/lib/log", () => ({ writeLog: async () => {} }))

const { eventHooks } = await import("../plugin/hooks/event")
const { getSessionMessages } = await import("../plugin/lib/opencode")
const { systemHooks } = await import("../plugin/hooks/system")
const { setPendingCompactionSnapshot, buildMessageSnapshot } = await import("../plugin/lib/autosave")
const { recordRetrievalSearch } = await import("../plugin/lib/status")
const {
  getSessionState,
  resetAllStates,
  markAutosaveComplete,
  AutosaveStatus,
} = await import("../plugin/lib/autosave")
const { resetConfig } = await import("../plugin/lib/config")
const { readStatusState, resetStatusState } = await import("../plugin/lib/status")

const project = { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" }
const user = (id: string, text: string) => ({ type: "user", id, time: { created: 1 }, text })
const assistant = (id: string, text: string) => ({
  type: "assistant", id, time: { created: 2 }, agent: "build", model: { providerID: "test", modelID: "test" },
  content: [{ type: "text", text }],
})
const ctx = (messages: object[], context = async () => messages) => ({ session: { context }, location: { project } })
const event = (type: string, sessionID: string) => ({ type, data: { sessionID } })
const setup = async () => {
  resetConfig()
  resetAllStates()
  await resetStatusState()
  adapterCalls.length = 0
  rejectAdapter = false
}

describe("V2 session lifecycle", () => {
  it("injects retrieval and keyword instructions once per user digest from context alone", async () => {
    await setup()
    const messages = [user("u1", "Please save this project build procedure.")]
    const context = ctx(messages)
    const first = { system: [] as { type: "text"; text: string }[] }
    await systemHooks(context, { sessionID: "life-retrieval" }, first)
    expect(first.system).toHaveLength(2)
    expect(first.system[0].text).toContain("search MemPalace")
    expect(first.system[1].text).toContain("mempalace_memory")
    const state = getSessionState("life-retrieval")
    expect(state.lastRetrievedUserDigest).toBe(state.messageSnapshot?.userDigest)
    expect(state.pendingRetrievalUserDigest).toBeUndefined()

    const second = { system: [] as typeof first.system }
    await systemHooks(context, { sessionID: "life-retrieval" }, second)
    expect(second.system).toEqual([])
    const status = await readStatusState()
    expect(status.counters.retrievalPrompts).toBe(1)
  })

  it("refreshes retrieval and keyword behavior once for the next user turn", async () => {
    await setup()
    let messages = [user("u1", "ordinary project discussion without save keyword")]
    const context = ctx([], async () => messages)
    const output = { system: [] as { type: "text"; text: string }[] }
    await systemHooks(context, { sessionID: "life-next-turn" }, output)
    expect(output.system).toHaveLength(1)
    messages = [...messages, assistant("a1", "Okay."), user("u2", "Please save this new project decision.")]
    const next = { system: [] as typeof output.system }
    await systemHooks(context, { sessionID: "life-next-turn" }, next)
    expect(next.system).toHaveLength(2)
    expect(next.system[0].text).toContain("search MemPalace")
    expect(next.system[1].text).toContain("mempalace_memory")
    const repeated = { system: [] as typeof output.system }
    await systemHooks(context, { sessionID: "life-next-turn" }, repeated)
    expect(repeated.system).toEqual([])
    const state = getSessionState("life-next-turn")
    expect(state.lastKeywordSavedUserDigest).toBe(state.messageSnapshot?.userDigest)
    expect((await readStatusState()).counters.retrievalPrompts).toBe(2)
  })

  it("judges only the current turn's final assistant response once on idle", async () => {
    await setup()
    const sessionID = "life-judge"
    const prior = [user("u0", "Old question"), assistant("a0", "[memory: improved] old response")]
    const priorCtx = ctx(prior)
    const prompt = { system: [] as { type: "text"; text: string }[] }
    await systemHooks(priorCtx, { sessionID }, prompt)
    await recordRetrievalSearch({ sessionId: sessionID, scope: "project", query: "Old question", result: { success: true, results: [] } })
    await eventHooks(priorCtx, event("session.idle", sessionID))
    expect(getSessionState(sessionID).lastRetrievedUserDigest).toBe(getSessionState(sessionID).messageSnapshot?.userDigest)
    expect((await readStatusState()).counters.retrievalJudge.improved).toBe(1)

    const current = [...prior, user("u1", "New question"), assistant("a1", "[memory: cited] current response")]
    const currentCtx = ctx(current)
    const nextPrompt = { system: [] as typeof prompt.system }
    await systemHooks(currentCtx, { sessionID }, nextPrompt)
    await recordRetrievalSearch({ sessionId: sessionID, scope: "project", query: "New question", result: { success: true, results: [] } })
    await eventHooks(currentCtx, event("session.idle", sessionID))
    await eventHooks(currentCtx, event("session.idle", sessionID))
    await eventHooks(currentCtx, event("session.deleted", sessionID))
    const status = await readStatusState()
    expect(status.counters.retrievalJudge.improved).toBe(1)
    expect(status.counters.retrievalJudge.cited).toBe(1)
  })

  it("uses the pending compaction snapshot after the live transcript changes", async () => {
    await setup()
    const sessionID = "life-compaction"
    const compactedMessages = [user("u1", "Preserve this completed project decision."), assistant("a1", "We selected Bun for reliable builds.")]
    const originalContext = ctx(compactedMessages)
    const prompt = { system: [] as { type: "text"; text: string }[] }
    await systemHooks(originalContext, { sessionID }, prompt)
    const compactionHook = async () => {
      const snapshot = buildMessageSnapshot(getSessionMessages(await originalContext.session.context({ sessionID })))
      setPendingCompactionSnapshot(sessionID, snapshot)
    }
    await compactionHook()
    const compactedContext = ctx([user("u2", "New compacted context")])
    await eventHooks(compactedContext, event("session.compaction.ended", sessionID))
    expect(adapterCalls).toHaveLength(1)
    expect(adapterCalls[0].mode).toBe("mine_messages")
    if (adapterCalls[0].mode !== "mine_messages") throw new Error("unexpected adapter mode")
    expect(adapterCalls[0].transcript).toContain("Preserve this completed project decision")
    expect(adapterCalls[0].transcript).not.toContain("New compacted context")
  })

  it("falls back to cached completed transcript when deletion context rejects", async () => {
    await setup()
    const sessionID = "life-delete"
    const cached = [user("u1", "Keep this completed deleted session decision."), assistant("a1", "We chose Bun for reliable builds.")]
    const context = ctx(cached)
    await systemHooks(context, { sessionID }, { system: [] })
    await eventHooks(context, event("session.step.ended", sessionID))
    const deletedContext = ctx([], async () => { throw new Error("session gone") })
    await eventHooks(deletedContext, event("session.deleted", sessionID))
    expect(adapterCalls).toHaveLength(1)
    if (adapterCalls[0].mode !== "mine_messages") throw new Error("unexpected adapter mode")
    expect(adapterCalls[0].transcript).toContain("Keep this completed deleted session decision")
  })

  it("marks thrown adapter calls failed and does not immediately retry idle", async () => {
    await setup()
    rejectAdapter = true
    const sessionID = "life-failure"
    const context = ctx([user("u1", "Keep this important decision despite adapter failure."), assistant("a1", "We chose Bun.")])
    await eventHooks(context, event("session.idle", sessionID))
    expect(adapterCalls).toHaveLength(1)
    expect(getSessionState(sessionID).status).toBe(AutosaveStatus.Failed)
    expect((await readStatusState()).lastAutosave?.outcome).toBe("failed")
    await eventHooks(context, event("session.idle", sessionID))
    expect(adapterCalls).toHaveLength(1)
  })
})
