import { describe, expect, test } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client"
import { getProjectName, loadSessionMessages, normalizeTranscript } from "../plugin/lib/opencode"

const messages: SessionMessageInfo[] = [
  { type: "user", id: "u1", time: { created: 1 }, text: "remember this" },
  { type: "assistant", id: "a1", time: { created: 2 }, agent: "assistant", model: { providerID: "p", modelID: "m" }, content: [
    { type: "reasoning", text: "private thoughts" },
    { type: "tool", callID: "call-1", tool: "search", state: { status: "completed", input: {}, output: "secret result", title: "search" } },
    { type: "text", text: "Visible answer." },
  ] },
  { type: "synthetic", id: "s1", time: { created: 3 }, text: "synthetic prompt" },
  { type: "system", id: "sys1", time: { created: 4 }, text: "system prompt" },
  { type: "compaction", id: "c1", time: { created: 5 }, summary: "old context", auto: true },
  { type: "assistant", id: "a2", time: { created: 6 }, agent: "assistant", model: { providerID: "p", modelID: "m" }, content: [
    { type: "reasoning", text: "reasoning only" },
    { type: "tool", callID: "call-2", tool: "read", state: { status: "completed", input: {}, output: "tool output", title: "read" } },
  ] },
  { type: "assistant", id: "a3", time: { created: 7 }, agent: "assistant", model: { providerID: "p", modelID: "m" }, content: [] },
]

describe("V2 transcript normalization", () => {
  test("keeps only user text and assistant text content", () => {
    expect(normalizeTranscript(messages)).toEqual([
      { role: "user", content: "remember this" },
      { role: "assistant", content: "Visible answer." },
    ])
  })

  test("handles empty records and retrieves transcript through session.context", async () => {
    expect(normalizeTranscript([])).toEqual([])
    const ctx = { session: { context: async ({ sessionID }: { sessionID: string }) => {
      expect(sessionID).toBe("session-1")
      return messages
    } } }
    expect(await loadSessionMessages(ctx, "session-1")).toEqual(normalizeTranscript(messages))
  })

  test("names project by canonical basename, falling back to directory", () => {
    expect(getProjectName({ canonical: "/repo/project", directory: "/worktree" })).toBe("project")
    expect(getProjectName({ canonical: "", directory: "/worktree" })).toBe("worktree")
  })
})
