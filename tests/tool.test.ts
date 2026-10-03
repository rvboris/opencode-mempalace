import { describe, expect, it } from "bun:test"

const { toolHooks } = await import("../plugin/hooks/tool")

describe("toolHooks", () => {
  it("blocks direct mempalace mutation tools", async () => {
    await expect(
      toolHooks({ tool: "mcp-router_mempalace_kg_add", sessionID: "tool-1" }),
    ).rejects.toThrow("Use mempalace_memory instead")
  })

  it("allows wrapper tool", async () => {
    await expect(
      toolHooks({ tool: "mempalace_memory", sessionID: "tool-2" }),
    ).resolves.toBeUndefined()
  })
})
