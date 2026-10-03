import { afterEach, describe, expect, it, mock } from "bun:test"
import os from "node:os"
import path from "node:path"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-v2-status.json")
mock.module("../plugin/lib/log", () => ({ writeLog: async () => {} }))
const { mempalaceMemoryTool } = await import("../plugin/tools/mempalace-memory")
const { mempalaceStatusTool } = await import("../plugin/tools/mempalace-status")

const ctx = { location: { project: { canonical: "/tmp/Demo", directory: "/tmp/Demo" } }, $: async () => {} }
const execContext = { sessionID: "v2-test" }
const parse = (result: { content: string }) => JSON.parse(result.content)

const { setAdapterSpawnForTests, resetAdapterTestHooks } = await import("../plugin/lib/adapter")

describe("V2 native tools", () => {
  afterEach(() => resetAdapterTestHooks())

  it("defines native tool metadata and rejects malformed inputs", async () => {
    const memory = mempalaceMemoryTool(ctx)
    expect(memory.name).toBe("mempalace_memory")
    expect(memory.input.type).toBe("object")
    expect(parse(await memory.execute({ mode: "nope" }, execContext)).success).toBe(false)
    expect(parse(await memory.execute({ mode: "save", content: 4 }, execContext)).success).toBe(false)
    const status = mempalaceStatusTool()
    expect(status.name).toBe("mempalace_status")
    expect(parse(await status.execute({ verbose: "true" }, execContext)).success).toBe(false)
  })

  it("validates checkpoint shapes and redacts nested persisted text", async () => {
    const { EventEmitter } = await import("node:events")
    class Stream extends EventEmitter {}
    let adapterPayload = ""
    class Child extends EventEmitter {
      stdout = new Stream(); stderr = new Stream(); stdin = { write: (chunk: string) => { adapterPayload = chunk }, end: () => { queueMicrotask(() => { this.stdout.emit("data", Buffer.from("{\"success\":true}")); this.emit("close", 0) }) } }; kill() {}
    }
    setAdapterSpawnForTests(() => new Child() as never)
    const toolDef = mempalaceMemoryTool(ctx)
    const malformed = await toolDef.execute({ mode: "checkpoint", items: JSON.stringify([{ wing: "x", room: "y", content: 7 }]) }, execContext)
    expect(parse(malformed).success).toBe(false)
    expect(malformed.content).toContain("items must")
    const validItems = [{ wing: "keep-id", room: "keep-room", content: "password=SuperSecret123" }]
    const validDiary = { agent_name: "keep-agent", topic: "keep-topic", entry: "secret <private>value</private>" }
    const out = await toolDef.execute({ mode: "checkpoint", items: JSON.stringify(validItems), diary: JSON.stringify(validDiary) }, execContext)
    expect(out).toHaveProperty("content")
    expect(parse(out).success).toBe(true)
    const request = JSON.parse(adapterPayload)
    expect(request.items[0]).toMatchObject({ wing: "keep-id", room: "keep-room" })
    expect(request.items[0].content).toContain("[REDACTED_SECRET]")
    expect(request.diary).toMatchObject({ agent_name: "keep-agent", topic: "keep-topic" })
    expect(request.diary.entry).toContain("[REDACTED_PRIVATE]")
    resetAdapterTestHooks()
  })

  it("returns status text in the V2 envelope with defaults", async () => {
    const status = mempalaceStatusTool()
    const result = await status.execute({}, execContext)
    expect(typeof result.content).toBe("string")
    expect(result.content.length).toBeGreaterThan(0)
  })
})
