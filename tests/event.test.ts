import { describe, expect, it } from "bun:test"

const { eventHooks } = await import("../plugin/hooks/event")
const { AutosaveStatus, buildTranscriptDigest, buildUserDigest, getSessionState } = await import("../plugin/lib/autosave")

describe("eventHooks", () => {
  it("marks autosave pending on idle when session progressed", async () => {
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
      project: {},
      directory: "",
      worktree: "",
      $: {},
    })

    await hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "event-1" } } })
    expect(getSessionState("event-1").status).toBe(AutosaveStatus.Pending)
  })

  it("finalizes running autosave on idle", async () => {
    const messages = [{ role: "user", content: "Remember project decision." }]
    const state = getSessionState("event-2")
    state.status = AutosaveStatus.Running
    state.pendingUserDigest = buildUserDigest(messages)
    state.pendingTranscriptDigest = buildTranscriptDigest(messages)
    state.successfulToolCalls = ["mempalace_add_drawer"]

    const hooks = eventHooks({
      client: { session: { messages: async () => ({ data: messages }) } },
      project: {},
      directory: "",
      worktree: "",
      $: {},
    })

    await hooks.event?.({ event: { type: "session.idle", properties: { sessionID: "event-2" } } })
    expect(getSessionState("event-2").status).toBe(AutosaveStatus.Saved)
  })
})
