import { describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import { stripJudgeTag, parseJudgeTag } from "../plugin/lib/derive"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-judge-test.json")

const { formatSessionHud, readStatusState, recordAutosave, recordRetrievalJudge, resetStatusState } = await import(
  "../plugin/lib/status"
)

describe("stripJudgeTag", () => {
  it("removes the tag from the end of text", () => {
    expect(stripJudgeTag("Here is the answer.\n\n[memory: improved]")).toBe("Here is the answer.")
  })

  it("removes tag without brackets", () => {
    expect(stripJudgeTag("Answer text\nmemory: none")).toBe("Answer text")
  })

  it("handles case-insensitive tags", () => {
    expect(stripJudgeTag("Answer\n[Memory: Saved-Time]")).toBe("Answer")
  })

  it("preserves text when no tag present", () => {
    expect(stripJudgeTag("Just a regular answer.")).toBe("Just a regular answer.")
  })

  it("handles empty input", () => {
    expect(stripJudgeTag("")).toBe("")
  })
})

describe("parseJudgeTag", () => {
  it("extracts verdict from bracketed tag", () => {
    expect(parseJudgeTag("Answer here\n\n[memory: improved]")).toBe("improved")
  })

  it("extracts verdict without brackets", () => {
    expect(parseJudgeTag("Answer\nmemory: cited")).toBe("cited")
  })

  it("is case-insensitive", () => {
    expect(parseJudgeTag("Answer\n[MEMORY: SAVED-TIME]")).toBe("saved-time")
  })

  it("returns null when no tag present", () => {
    expect(parseJudgeTag("Answer without a tag")).toBeNull()
  })

  it("returns null for empty input", () => {
    expect(parseJudgeTag("")).toBeNull()
  })

  it("returns the last match in a transcript with multiple tags", () => {
    const transcript = "USER: question\nASSISTANT: answer1\n[memory: none]\nUSER: question2\nASSISTANT: answer2\n[memory: improved]"
    expect(parseJudgeTag(transcript)).toBe("improved")
  })
})

describe("recordRetrievalJudge", () => {
  it("increments the correct judge counter", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "j1", verdict: "improved" })
    const state = await readStatusState()
    expect(state.counters.retrievalJudge.improved).toBe(1)
  })

  it("maps saved-time to savedTime counter key", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "j2", verdict: "saved-time" })
    const state = await readStatusState()
    expect(state.counters.retrievalJudge.savedTime).toBe(1)
  })

  it("adds to helpedSessionIds on improved or saved-time", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "j3", verdict: "improved" })
    await recordRetrievalJudge({ sessionId: "j3", verdict: "saved-time" })
    const state = await readStatusState()
    expect(state.helpedSessionIds).toContain("j3")
    expect(state.helpedSessionIds.length).toBe(1)
  })

  it("does not add to helpedSessionIds on none or cited", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "j4", verdict: "none" })
    await recordRetrievalJudge({ sessionId: "j4", verdict: "cited" })
    const state = await readStatusState()
    expect(state.helpedSessionIds).not.toContain("j4")
  })

  it("increments unknown counter", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "j5", verdict: "unknown" })
    const state = await readStatusState()
    expect(state.counters.retrievalJudge.unknown).toBe(1)
  })
})

describe("formatSessionHud with judge", () => {
  it("shows helps when improved or saved-time", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-j1", verdict: "improved" })
    await recordRetrievalJudge({ sessionId: "hud-j1", verdict: "improved" })
    await recordRetrievalJudge({ sessionId: "hud-j1", verdict: "none" })
    await recordRetrievalJudge({ sessionId: "hud-j1", verdict: "cited" })
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j1")).toBe("MEM helps 2")
  })

  it("counts saved-time in helps", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-j2", verdict: "saved-time" })
    await recordRetrievalJudge({ sessionId: "hud-j2", verdict: "none" })
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j2")).toBe("MEM helps 1")
  })

  it("shows cited when only cited", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-j3", verdict: "cited" })
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j3")).toBe("MEM cited 1")
  })

  it("shows no help when judged but none helped and not cited", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-j4", verdict: "none" })
    await recordRetrievalJudge({ sessionId: "hud-j4", verdict: "none" })
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j4")).toBe("MEM no help")
  })

  it("shows unknown when only unknown", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-j5", verdict: "unknown" })
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j5")).toBe("MEM unknown")
  })

  it("shows quiet when no judge data", async () => {
    await resetStatusState()
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j6")).toBe("MEM quiet")
  })

  it("appends fail flag", async () => {
    await resetStatusState()
    await recordRetrievalJudge({ sessionId: "hud-j7", verdict: "improved" })
    await recordAutosave({ sessionId: "hud-j7", outcome: "failed", reason: "adapter error" })
    const state = await readStatusState()
    expect(formatSessionHud(state, "hud-j7")).toBe("MEM helps 1 · fail 1")
  })
})
