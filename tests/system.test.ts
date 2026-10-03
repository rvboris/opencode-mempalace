import { describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-system-status.json")

const { eventHooks } = await import("../plugin/hooks/event")
const { systemHooks } = await import("../plugin/hooks/system")
const { getSessionState, markRetrievalPending, resetAllStates } = await import(
  "../plugin/lib/autosave",
)
const { resetConfig } = await import("../plugin/lib/config")
const { readStatusState, resetStatusState } = await import("../plugin/lib/status")

describe("systemHooks", () => {
  it("injects retrieval instruction when pending", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    markRetrievalPending("sys-1", "user-1")
    const output = { system: [] as string[] }

    const ctx = {
      session: { context: async () => [{ type: "user", id: "u1", time: { created: 1 }, text: "Remember this" }] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }
    await systemHooks(ctx, { sessionID: "sys-1" }, output)

    expect(output.system.length).toBe(2)
    expect(getSessionState("sys-1").retrievalPending).toBe(false)
    const status = await readStatusState()
    expect(status.counters.retrievalPrompts).toBe(1)
    expect(status.lastRetrievalPrompt?.sessionId).toBe("sys-1")
  })

  it("does nothing when no active session", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    const output = { system: [] as string[] }
    const ctx = {
      session: { context: async () => [] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }
    await systemHooks(ctx, { sessionID: "sys-empty" }, output)
    expect(output.system.length).toBe(0)
  })

  it("does not leak pending retrieval across overlapping sessions", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    markRetrievalPending("sys-a", "user-a")
    markRetrievalPending("sys-b", "user-b")
    const output = { system: [] as string[] }

    const ctx = {
      session: { context: async ({ sessionID }: { sessionID: string }) => [{ type: "user", id: sessionID, time: { created: 1 }, text: sessionID === "sys-a" ? "user-a" : "user-b" }] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }

    await systemHooks(ctx, { sessionID: "sys-a" }, output)

    expect(output.system.length).toBe(1)
    expect(getSessionState("sys-a").retrievalPending).toBe(false)
    expect(getSessionState("sys-b").retrievalPending).toBe(true)
  })

  it("retrieves from fresh session context after message update", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    let messageCalls = 0
    const ctx = {
      session: {
        context: async () => {
          messageCalls += 1
          return [{ type: "user", id: "cache-user", time: { created: 1 }, text: "Cache me" }]
        },
      },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }

    await eventHooks(ctx, { type: "message.updated", data: { sessionID: "sys-cache" } })
    await systemHooks(ctx, { sessionID: "sys-cache" }, { system: [] })

    expect(messageCalls).toBe(1)
  })
})
