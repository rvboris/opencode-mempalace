import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { buildMessageSnapshot, getMessageSnapshot, resetAllStates } from "../plugin/lib/autosave"
import { resetConfig } from "../plugin/lib/config"
import { resetStatusState } from "../plugin/lib/status"
import { systemHooks } from "../plugin/hooks/system"
import { eventHooks } from "../plugin/hooks/event"

const originalHome = process.env.HOME
const testHome = await fs.mkdtemp(path.join(os.tmpdir(), "mempalace-v2-hooks-"))
process.env.HOME = testHome
process.env.MEMPALACE_STATUS_FILE = path.join(testHome, "status.json")
process.env.MEMPALACE_AUTOSAVE_ENABLED = "false"

beforeAll(async () => {
  await resetStatusState()
})
afterAll(async () => {
  resetAllStates()
  resetConfig()
  await resetStatusState()
  if (originalHome === undefined) delete process.env.HOME
  else process.env.HOME = originalHome
  delete process.env.MEMPALACE_STATUS_FILE
  delete process.env.MEMPALACE_AUTOSAVE_ENABLED
  await fs.rm(testHome, { recursive: true, force: true })
})

describe("V2 server hook contracts", () => {
  test("snapshots normalized MessageLike.content", () => {
    const snapshot = buildMessageSnapshot([
      { role: "user", content: "remember this" },
      { role: "assistant", content: "Visible answer." },
    ])
    expect(snapshot.lastUserMessage).toBe("remember this")
    expect(snapshot.transcript).toContain("Visible answer.")
    expect(snapshot.userDigest).not.toBe("")
  })

  test("context hook refreshes from the latest session transcript before system work", async () => {
    resetAllStates()
    const project = { id: "p", directory: "/tmp/demo", canonical: "/tmp/demo" }
    const ctx = { location: { project }, session: { context: async () => [
      { type: "user", id: "u", time: { created: 1 }, text: "latest question" },
      { type: "assistant", id: "a", time: { created: 2 }, agent: "a", model: { providerID: "p", modelID: "m" }, content: [{ type: "text", text: "latest answer" }] },
    ] } }
    const output = { system: [] as { type: "text"; text: string }[] }
    await systemHooks(ctx as never, { sessionID: "hook-context" }, output)
    const snapshot = getMessageSnapshot("hook-context")
    expect(snapshot?.lastUserMessage).toBe("latest question")
    expect(snapshot?.transcript).toContain("latest answer")
    expect(output.system.length).toBeGreaterThan(0)
  })

  test("idle event refreshes transcript from ctx.session.context", async () => {
    resetAllStates()
    const ctx = { location: { project: { id: "p", directory: "/tmp/demo", canonical: "/tmp/demo" } }, session: { context: async () => [
      { type: "user", id: "u", time: { created: 1 }, text: "idle question" },
      { type: "assistant", id: "a", time: { created: 2 }, agent: "a", model: { providerID: "p", modelID: "m" }, content: [{ type: "text", text: "idle answer" }] },
    ] } }
    await eventHooks(ctx as never, { type: "session.idle", data: { sessionID: "hook-idle" } })
    expect(getMessageSnapshot("hook-idle")?.transcript).toContain("idle answer")
  })
})
