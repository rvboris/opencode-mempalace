import { describe, expect, it, mock } from "bun:test"
import type { AdapterRequest } from "../plugin/lib/types"

const createSchemaStub = () => ({
  optional: () => ({ default: () => ({}) }),
  default: () => ({}),
})

const mockTool = Object.assign(<T>(input: T) => input, {
  schema: {
    enum: (_values: readonly string[]) => createSchemaStub(),
    string: () => createSchemaStub(),
    number: () => createSchemaStub(),
  },
})

mock.module("@opencode-ai/plugin", () => ({
  tool: mockTool,
}))

const adapterCalls: AdapterRequest[] = []
mock.module("../plugin/lib/adapter", () => ({
  executeAdapter: async (_shell: unknown, payload: AdapterRequest) => {
    adapterCalls.push(payload)
    return { success: true, payload }
  },
}))

const { mempalaceMemoryTool } = await import("../plugin/tools/mempalace-memory")
const { resetConfig } = await import("../plugin/lib/config")

describe("mempalaceMemoryTool", () => {
  it("redacts private content on save", async () => {
    resetConfig()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "save", scope: "project", room: "decisions", content: "keep <private>secret</private> this" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(result).toContain("success")
    expect(adapterCalls[0].mode).toBe("save")
    expect(adapterCalls[0].content).toContain("[REDACTED_PRIVATE]")
  })

  it("routes search to the correct scoped wing", async () => {
    resetConfig()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    await toolDef.execute(
      { mode: "search", scope: "user", query: "prefs", room: "workflow", content: undefined },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(adapterCalls[0].mode).toBe("search")
    expect(adapterCalls[0].wing).toBe("wing_user_profile")
  })

  it("sanitizes invalid unicode surrogates in kg_add", async () => {
    resetConfig()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    await toolDef.execute(
      { mode: "kg_add", scope: "user", subject: "User", predicate: "name", object: "Борис\udc81" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(adapterCalls[0].object).toContain("Борис")
    expect(/[\uDC00-\uDFFF]/.test(adapterCalls[0].object)).toBe(false)
  })
})
