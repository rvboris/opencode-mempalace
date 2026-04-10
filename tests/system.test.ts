import { describe, expect, it } from "bun:test"

const { systemHooks } = await import("../plugin/hooks/system")
const { getSessionState, markRetrievalPending, resetAllStates, setCurrentTurnSessionId } = await import(
  "../plugin/lib/autosave",
)
const { resetConfig } = await import("../plugin/lib/config")

describe("systemHooks", () => {
  it("injects retrieval instruction when pending", async () => {
    resetConfig()
    resetAllStates()
    markRetrievalPending("sys-1", "user-1")
    setCurrentTurnSessionId("sys-1")
    const output = { system: [] as string[] }

    const hooks = systemHooks({
      client: {
        session: { messages: async () => ({ data: [{ role: "user", content: "Remember this" }] }) },
      },
      project: { name: "Demo" },
    })
    await hooks["experimental.chat.system.transform"]?.({}, output)

    expect(output.system.length).toBe(1)
    expect(getSessionState("sys-1").retrievalPending).toBe(false)
  })

  it("does nothing when no active session", async () => {
    resetConfig()
    resetAllStates()
    const output = { system: [] as string[] }
    const hooks = systemHooks({ client: { session: { messages: async () => ({ data: [] }) } }, project: {} })
    await hooks["experimental.chat.system.transform"]?.({}, output)
    expect(output.system.length).toBe(0)
  })
})
