import { describe, expect, it } from "bun:test"

const { systemHooks } = await import("../plugin/hooks/system")
const { AutosaveReason, AutosaveStatus, getSessionState, markPending, markRetrievalPending, resetAllStates, setCurrentTurnSessionId } = await import(
  "../plugin/lib/autosave",
)
const { resetConfig } = await import("../plugin/lib/config")

describe("systemHooks", () => {
  it("injects hidden autosave instruction when pending", async () => {
    resetConfig()
    resetAllStates()
    markPending("sys-1", AutosaveReason.Idle, "user-1", "tx-1")
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

    expect(output.system.length).toBe(2)
    expect(getSessionState("sys-1").status).toBe(AutosaveStatus.Running)
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
