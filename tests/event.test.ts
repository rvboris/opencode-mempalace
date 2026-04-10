import { describe, expect, it, mock } from "bun:test"

const adapterCalls: any[] = []
mock.module("../plugin/lib/adapter", () => ({
  executeAdapter: async (_shell: any, payload: any) => {
    adapterCalls.push(payload)
    return { success: true }
  },
}))

const { eventHooks } = await import("../plugin/hooks/event")
const { AutosaveStatus, getSessionState, resetAllStates } = await import("../plugin/lib/autosave")
const { resetConfig } = await import("../plugin/lib/config")

describe("eventHooks", () => {
  it("mines session on idle when session progressed", async () => {
    resetConfig()
    resetAllStates()
    adapterCalls.length = 0
    const hooks = eventHooks({
      client: {
        session: {
          messages: async () => ({
            data: [
              { role: "user", content: "Remember project decision." },
              { role: "assistant", content: "Done." },
            ],
          }),
        },
      },
      project: { name: "Demo" },
      directory: "",
      worktree: "",
      $: async () => {},
    })

    await hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "event-1" } } })
    expect(adapterCalls[0].mode).toBe("mine_messages")
    expect(getSessionState("event-1").status).toBe(AutosaveStatus.Saved)
  })

  it("marks retrieval pending on normal message updates", async () => {
    resetConfig()
    resetAllStates()
    const hooks = eventHooks({
      client: { session: { messages: async () => ({ data: [{ role: "user", content: "How do we build?" }] }) } },
      project: {},
      directory: "",
      worktree: "",
      $: async () => {},
    })
    await hooks.event?.({ event: { type: "message.updated", properties: { sessionID: "event-2" } } })
    expect(getSessionState("event-2").retrievalPending).toBe(true)
  })
})
