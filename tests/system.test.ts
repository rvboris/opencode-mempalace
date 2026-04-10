import { describe, expect, it } from "bun:test"

const { eventHooks } = await import("../plugin/hooks/event")
const { systemHooks } = await import("../plugin/hooks/system")
const { getSessionState, markRetrievalPending, resetAllStates } = await import(
  "../plugin/lib/autosave",
)
const { resetConfig } = await import("../plugin/lib/config")

describe("systemHooks", () => {
  it("injects retrieval instruction when pending", async () => {
    resetConfig()
    resetAllStates()
    markRetrievalPending("sys-1", "user-1")
    const output = { system: [] as string[] }

    const hooks = systemHooks({
      client: {
        session: { messages: async () => ({ data: [{ role: "user", content: "Remember this" }] }) },
      },
      project: { name: "Demo" },
    })
    await hooks["experimental.chat.system.transform"]?.({ sessionID: "sys-1" }, output)

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

  it("does not leak pending retrieval across overlapping sessions", async () => {
    resetConfig()
    resetAllStates()
    markRetrievalPending("sys-a", "user-a")
    markRetrievalPending("sys-b", "user-b")
    const output = { system: [] as string[] }

    const hooks = systemHooks({
      client: {
        session: {
          messages: async ({ path }: { path: { id: string } }) => ({ data: [{ role: "user", content: path.id }] }),
        },
      },
      project: { name: "Demo" },
    })

    await hooks["experimental.chat.system.transform"]?.({ sessionID: "sys-a" }, output)

    expect(output.system.length).toBe(1)
    expect(getSessionState("sys-a").retrievalPending).toBe(false)
    expect(getSessionState("sys-b").retrievalPending).toBe(true)
  })

  it("reuses cached snapshot after message update", async () => {
    resetConfig()
    resetAllStates()
    let messageCalls = 0
    const client = {
      session: {
        messages: async () => {
          messageCalls += 1
          return { data: [{ role: "user", content: "Cache me" }] }
        },
      },
    }

    const event = eventHooks({
      client,
      project: { name: "Demo" },
      directory: "",
      worktree: "",
      $: async () => {},
    })
    const system = systemHooks({ client, project: { name: "Demo" } })

    await event.event?.({ event: { type: "message.updated", properties: { sessionID: "sys-cache" } } })
    await system["experimental.chat.system.transform"]?.({ sessionID: "sys-cache" }, { system: [] })

    expect(messageCalls).toBe(1)
  })
})
