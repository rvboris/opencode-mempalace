import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { EventEmitter } from "node:events"
import os from "node:os"
import path from "node:path"
import type { AdapterRequest } from "../plugin/lib/types"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-wrapper-tool-status.json")

const createSchemaStub = () => ({
  optional: () => ({ default: () => ({}) }),
  default: () => ({}),
})

const mockTool = Object.assign(<T>(input: T) => input, {
  schema: {
    enum: (_values: readonly string[]) => createSchemaStub(),
    string: () => createSchemaStub(),
    number: () => createSchemaStub(),
    boolean: () => createSchemaStub(),
  },
})

mock.module("@opencode-ai/plugin", () => ({
  tool: mockTool,
}))

const adapterCalls: AdapterRequest[] = []

class FakeStream extends EventEmitter {}

class FakeChild extends EventEmitter {
  stdout = new FakeStream()
  stderr = new FakeStream()
  stdin = {
    write: (chunk: string, _encoding: BufferEncoding) => {
      adapterCalls.push(JSON.parse(chunk) as AdapterRequest)
    },
    end: () => {
      queueMicrotask(() => {
        const payload = adapterCalls.at(-1)
        if (payload?.mode === "search") {
          this.stdout.emit("data", Buffer.from('{"success":true,"results":[{"content":"Use Bun for builds and tests."}]}'))
        } else {
          this.stdout.emit("data", Buffer.from(JSON.stringify({ success: true, payload })))
        }
        this.emit("close", 0)
      })
    },
  }

  kill() {
    this.emit("close", null)
  }
}

mock.module("../plugin/lib/log", () => ({
  writeLog: async () => {},
}))

const { mempalaceMemoryTool } = await import("../plugin/tools/mempalace-memory")
const { resetConfig } = await import("../plugin/lib/config")
const { readStatusState, resetStatusState } = await import("../plugin/lib/status")
const { resetAdapterTestHooks, setAdapterSpawnForTests } = await import("../plugin/lib/adapter")

beforeEach(() => {
  resetAdapterTestHooks()
  setAdapterSpawnForTests(() => new FakeChild() as never)
})

afterEach(() => {
  resetAdapterTestHooks()
})

describe("mempalaceMemoryTool", () => {
  it("redacts private content on save", async () => {
    resetConfig()
    await resetStatusState()
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
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "search", scope: "user", query: "prefs", room: "workflow", content: undefined },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(JSON.parse(result as string)._retrieval_summary).toBeDefined()
    expect(adapterCalls[0].mode).toBe("search")
    expect(adapterCalls[0].wing).toBe("wing_user_profile")
    const status = await readStatusState()
    expect(status.counters.retrievalSearches).toBe(1)
    expect(status.counters.retrievalSearches).toBe(1)
  })

  it("includes retrieval summary in search response", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "search", scope: "project", query: "build", room: "workflow", content: undefined },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    const parsed = JSON.parse(result as string)
    expect(parsed._retrieval_summary).toContain("Found 1 relevant memory")
    expect(parsed._retrieval_summary).toContain("Use Bun for builds and tests.")
  })

  it("sanitizes invalid unicode surrogates in kg_add", async () => {
    resetConfig()
    await resetStatusState()
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

  it("routes delete to adapter with drawer_id", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "delete", scope: "project", drawer_id: "drawer_123" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(JSON.parse(result as string).success).toBe(true)
    expect(adapterCalls[0].mode).toBe("delete")
    expect((adapterCalls[0] as { drawer_id: string }).drawer_id).toBe("drawer_123")
  })

  it("requires drawer_id for delete mode", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "delete", scope: "project" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(JSON.parse(result as string).success).toBe(false)
    expect(JSON.parse(result as string).error).toContain("drawer_id")
    expect(adapterCalls.length).toBe(0)
  })

  it("routes delete_by_source with dry_run default", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    await toolDef.execute(
      { mode: "delete_by_source", scope: "project", source_file: "/old/data.jsonl" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(adapterCalls[0].mode).toBe("delete_by_source")
    const call = adapterCalls[0] as { source_file: string; dry_run: boolean }
    expect(call.source_file).toBe("/old/data.jsonl")
    expect(call.dry_run).toBe(true)
  })

  it("routes kg_query with entity and direction", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    await toolDef.execute(
      { mode: "kg_query", scope: "project", entity: "my-repo", direction: "incoming" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(adapterCalls[0].mode).toBe("kg_query")
    const call = adapterCalls[0] as { entity: string; direction: string }
    expect(call.entity).toBe("my-repo")
    expect(call.direction).toBe("incoming")
  })

  it("requires entity for kg_query mode", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "kg_query", scope: "project" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(JSON.parse(result as string).success).toBe(false)
    expect(JSON.parse(result as string).error).toContain("entity")
    expect(adapterCalls.length).toBe(0)
  })

  it("routes diary_read with default agent", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    await toolDef.execute(
      { mode: "diary_read", scope: "project", last_n: 5 },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(adapterCalls[0].mode).toBe("diary_read")
    const call = adapterCalls[0] as { agent_name: string; last_n: number }
    expect(call.agent_name).toBe("opencode")
    expect(call.last_n).toBe(5)
  })

  it("parses checkpoint items JSON and routes to adapter", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    await toolDef.execute(
      {
        mode: "checkpoint",
        scope: "project",
        items: JSON.stringify([
          { wing: "wing_user", room: "preferences", content: "dark mode" },
          { wing: "wing_project", room: "decisions", content: "uses bun" },
        ]),
        dedup_threshold: 0.8,
      },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(adapterCalls[0].mode).toBe("checkpoint")
    const call = adapterCalls[0] as { items: unknown[]; dedup_threshold: number }
    expect(call.items).toHaveLength(2)
    expect(call.dedup_threshold).toBe(0.8)
  })

  it("rejects invalid JSON for checkpoint items", async () => {
    resetConfig()
    await resetStatusState()
    adapterCalls.length = 0
    const toolDef = mempalaceMemoryTool({
      project: { name: "Demo" },
      $: async () => {},
    })

    const result = await toolDef.execute(
      { mode: "checkpoint", scope: "project", items: "not valid json{{{" },
      { sessionID: "s", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(JSON.parse(result as string).success).toBe(false)
    expect(JSON.parse(result as string).error).toContain("valid JSON")
    expect(adapterCalls.length).toBe(0)
  })
})
