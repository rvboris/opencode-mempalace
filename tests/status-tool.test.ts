import { describe, expect, it, mock } from "bun:test"
import os from "node:os"
import path from "node:path"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-status-tool.json")

const createSchemaStub = () => ({
  optional: () => ({ default: () => ({}) }),
  default: () => ({}),
})

const mockTool = Object.assign(<T>(input: T) => input, {
  schema: {
    boolean: () => createSchemaStub(),
  },
})

mock.module("@opencode-ai/plugin", () => ({
  tool: mockTool,
}))

const { recordAutosave, recordMemoryWrite, recordRetrievalSearch, resetStatusState } = await import("../plugin/lib/status")
const { mempalaceStatusTool } = await import("../plugin/tools/mempalace-status")

describe("mempalaceStatusTool", () => {
  it("shows recent retrieval and autosave evidence", async () => {
    await resetStatusState()
    await recordRetrievalSearch({
      sessionId: "status-1",
      scope: "project",
      room: "workflow",
      query: "build command",
      result: {
        success: true,
        results: [{ content: "Use Bun for builds and tests." }, { content: "Run npm run build for release bundles." }],
      },
    })
    await recordAutosave({
      sessionId: "status-1",
      outcome: "saved",
      reason: "idle",
      sourcePreview: "Remember the build command for releases.",
    })
    await recordMemoryWrite({
      mode: "save",
      scope: "project",
      room: "decisions",
      preview: "Use Bun for local test runs.",
    })

    const toolDef = mempalaceStatusTool()
    const result = await toolDef.execute(
      { verbose: true },
      { sessionID: "status-1", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(result).toContain("Current session")
    expect(result).toContain("- Memory lookup: found 2 relevant memories.")
    expect(result).toContain("Relevant memories:")
    expect(result).toContain("- Autosave: saved session context after idle.")
    expect(result).toContain("Last activity")
    expect(result).toContain("Last explicit memory write: save stored `Use Bun for local test runs.`.")
  })

  it("uses compact output by default for quick checks", async () => {
    await resetStatusState()
    await recordRetrievalSearch({
      sessionId: "status-compact",
      scope: "project",
      room: "workflow",
      query: "release process",
      result: {
        success: true,
        results: [{ content: "Release builds use npm run build." }],
      },
    })
    await recordAutosave({
      sessionId: "status-compact",
      outcome: "saved",
      reason: "idle",
    })

    const toolDef = mempalaceStatusTool()
    const result = await toolDef.execute(
      {},
      { sessionID: "status-compact", messageID: "m", agent: "a", abort: new AbortController().signal },
    )

    expect(result).toContain("- Current session: 1 relevant memory found; autosave saved after idle.")
    expect(result).toContain("- Last activity: no memory lookup recorded; no autosave recorded.")
    expect(result).not.toContain("Totals:")
  })
})
