import { describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-status-hud.json")

const {
  formatSessionHud,
  readStatusState,
  recordAutosave,
  recordMemoryWrite,
  recordRetrievalSearch,
  resetStatusState,
} = await import("../plugin/lib/status")

describe("formatSessionHud", () => {
  it("shows per-session counters for the active session", async () => {
    await resetStatusState()
    await recordRetrievalSearch({
      sessionId: "hud-1",
      scope: "project",
      room: "workflow",
      query: "deploy docs",
      result: { success: true, results: [{ content: "Deploy with bun run build" }] },
    })
    await recordAutosave({
      sessionId: "hud-1",
      outcome: "saved",
      reason: "idle",
    })
    await recordMemoryWrite({
      sessionId: "hud-1",
      mode: "save",
      scope: "project",
      room: "workflow",
      preview: "Deploy docs live in README.",
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-1")).toBe("MEM hits 1 · saved 1 · failed 0 · writes 1")
  })

  it("falls back cleanly when a session has no tracked memory activity", async () => {
    await resetStatusState()
    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-empty")).toBe("MEM no activity yet")
  })

  it("marks skipped autosaves explicitly", async () => {
    await resetStatusState()
    await recordAutosave({
      sessionId: "hud-skipped",
      outcome: "skipped",
      reason: "duplicate transcript",
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-skipped")).toBe("MEM SKIPPED · hits 0 · saved 0 · failed 0 · skipped 1")
  })

  it("marks failed autosaves explicitly", async () => {
    await resetStatusState()
    await recordAutosave({
      sessionId: "hud-failed",
      outcome: "failed",
      reason: "adapter error",
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-failed")).toBe("MEM FAILED · hits 0 · saved 0 · failed 1")
  })
})
