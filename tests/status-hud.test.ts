import { describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-status-hud.json")

const {
  formatSessionHud,
  readStatusState,
  recordAutosave,
  recordMemoryWrite,
  recordRetrievalJudge,
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
    await recordRetrievalJudge({ sessionId: "hud-1", verdict: "improved" })
    await recordMemoryWrite({
      sessionId: "hud-1",
      mode: "save",
      scope: "project",
      room: "workflow",
      preview: "Deploy docs live in README.",
    })
    await recordAutosave({
      sessionId: "hud-1",
      outcome: "saved",
      reason: "idle",
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-1")).toBe("MEM helps 1")
  })

  it("falls back cleanly when a session has no tracked memory activity", async () => {
    await resetStatusState()
    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-empty")).toBe("MEM quiet")
  })

  it("marks skipped autosaves explicitly", async () => {
    await resetStatusState()
    await recordAutosave({
      sessionId: "hud-skipped",
      outcome: "skipped",
      reason: "duplicate transcript",
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-skipped")).toBe("MEM quiet · skip 1")
  })

  it("shows retrieval hits before a judge verdict", async () => {
    await resetStatusState()
    await recordRetrievalSearch({
      sessionId: "hud-found",
      scope: "project",
      room: "workflow",
      query: "deploy docs",
      result: { success: true, results: [{ content: "Deploy with bun run build" }, { content: "Use bun test" }] },
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-found")).toBe("MEM found 2")
  })

  it("shows no hits before a judge verdict", async () => {
    await resetStatusState()
    await recordRetrievalSearch({
      sessionId: "hud-no-hits",
      scope: "project",
      room: "workflow",
      query: "missing docs",
      result: { success: true, results: [] },
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-no-hits")).toBe("MEM no hits")
  })

  it("shows searched when retrieval count is unavailable", async () => {
    await resetStatusState()
    await recordRetrievalSearch({
      sessionId: "hud-searched",
      scope: "project",
      room: "workflow",
      query: "adapter summary",
      result: { success: true },
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-searched")).toBe("MEM searched")
  })

  it("marks failed autosaves explicitly", async () => {
    await resetStatusState()
    await recordAutosave({
      sessionId: "hud-failed",
      outcome: "failed",
      reason: "adapter error",
    })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-failed")).toBe("MEM quiet · fail 1")
  })

  it("cited only shows citation", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-cited", verdict: "cited" })
    await recordRetrievalJudge({ sessionId: "hud-cited", verdict: "cited" })

    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-cited")).toBe("MEM cited 2")
  })

  it("judged but none helped says no help", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-none", verdict: "none" })
    await recordRetrievalJudge({ sessionId: "hud-none", verdict: "none" })
    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-none")).toBe("MEM no help")
  })

  it("unknown verdicts show unknown", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-unk", verdict: "unknown" })
    const state = await readStatusState()

    expect(formatSessionHud(state, "hud-unk")).toBe("MEM unknown")
  })
})
