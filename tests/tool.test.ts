import { describe, expect, it } from "bun:test"

const { toolHooks } = await import("../plugin/hooks/tool")
const { AutosaveStatus, getSessionState } = await import("../plugin/lib/autosave")

describe("toolHooks", () => {
  it("counts successful mutating mempalace_memory calls during autosave", async () => {
    const state = getSessionState("tool-1")
    state.status = AutosaveStatus.Running

    const hooks = toolHooks()
    await hooks["tool.execute.before"]?.(
      { tool: "mempalace_memory", sessionID: "tool-1", callID: "1" },
      { args: { mode: "save" } },
    )
    await hooks["tool.execute.after"]?.(
      { tool: "mempalace_memory", sessionID: "tool-1", callID: "1" },
      { output: '{"success":true}', metadata: {} },
    )

    expect(getSessionState("tool-1").successfulToolCalls.length).toBe(1)
  })

  it("ignores failed mempalace_memory calls", async () => {
    const state = getSessionState("tool-2")
    state.status = AutosaveStatus.Running

    const hooks = toolHooks()
    await hooks["tool.execute.before"]?.(
      { tool: "mempalace_memory", sessionID: "tool-2", callID: "1" },
      { args: { mode: "save" } },
    )
    await hooks["tool.execute.after"]?.(
      { tool: "mempalace_memory", sessionID: "tool-2", callID: "1" },
      { output: '{"success":false,"error":"boom"}', metadata: {} },
    )

    expect(getSessionState("tool-2").successfulToolCalls.length).toBe(0)
  })

  it("ignores read-only mempalace_memory calls for autosave success", async () => {
    const state = getSessionState("tool-3")
    state.status = AutosaveStatus.Running

    const hooks = toolHooks()
    await hooks["tool.execute.before"]?.(
      { tool: "mempalace_memory", sessionID: "tool-3", callID: "2" },
      { args: { mode: "search" } },
    )
    await hooks["tool.execute.after"]?.(
      { tool: "mempalace_memory", sessionID: "tool-3", callID: "2" },
      { output: '{"success":true}', metadata: {} },
    )

    expect(getSessionState("tool-3").successfulToolCalls.length).toBe(0)
  })

  it("ignores tool calls with mismatched metadata session", async () => {
    const state = getSessionState("tool-4")
    state.status = AutosaveStatus.Running

    const hooks = toolHooks()
    await hooks["tool.execute.before"]?.(
      { tool: "mempalace_memory", sessionID: "tool-4", callID: "3" },
      { args: { mode: "save" } },
    )
    await hooks["tool.execute.after"]?.(
      { tool: "mempalace_memory", sessionID: "tool-4", callID: "3" },
      { output: '{"success":true}', metadata: { sessionID: "other" } },
    )

    expect(getSessionState("tool-4").successfulToolCalls.length).toBe(0)
  })

  it("blocks direct mempalace mutation tools outside wrapper bypass", async () => {
    const hooks = toolHooks()
    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "mcp-router_mempalace_kg_add", sessionID: "tool-5" },
        { args: {} },
      ),
    ).rejects.toThrow("Use mempalace_memory instead")
  })
})
