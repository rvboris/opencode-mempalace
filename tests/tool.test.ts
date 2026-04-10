import { describe, expect, it } from "bun:test"

const { toolHooks } = await import("../plugin/hooks/tool")

describe("toolHooks", () => {
  it("blocks direct mempalace mutation tools", async () => {
    const hooks = toolHooks()
    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "mcp-router_mempalace_kg_add", sessionID: "tool-1" },
        { args: {} },
      ),
    ).rejects.toThrow("Use mempalace_memory instead")
  })

  it("allows wrapper tool", async () => {
    const hooks = toolHooks()
    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "mempalace_memory", sessionID: "tool-2" },
        { args: { mode: "save" } },
      ),
    ).resolves.toBeUndefined()
  })
})
