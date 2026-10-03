import { describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-status-tool.json")

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
      { sessionID: "status-1" },
    )

    expect(result.content).toContain("Current session")
    expect(result.content).toContain("- Memory lookup: found 2 relevant memories.")
    expect(result.content).toContain("Relevant memories:")
    expect(result.content).toContain("- Autosave: saved session context after idle.")
    expect(result.content).toContain("Last activity")
    expect(result.content).toContain("Last explicit memory write: save stored `Use Bun for local test runs.`.")
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
      { compact: true },
      { sessionID: "status-compact" },
    )

    expect(result.content).toContain("- Current session: 1 relevant memory found; autosave saved after idle.")
    expect(result.content).toContain("- Last activity: no memory lookup recorded; no autosave recorded.")
    expect(result.content).not.toContain("Totals:")
  })
})
