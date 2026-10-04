import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import type { AdapterRequest } from "../plugin/lib/types"
import { FakeAdapterChild } from "./helpers/fake-adapter"

process.env.MEMPALACE_STATUS_FILE = path.join(os.tmpdir(), "mempalace-event-status.json")

const adapterCalls: AdapterRequest[] = []

const { eventHooks } = await import("../plugin/hooks/event")
const { AutosaveStatus, getSessionState, resetAllStates } = await import("../plugin/lib/autosave")
const { resetConfig } = await import("../plugin/lib/config")
const { readStatusState, resetStatusState } = await import("../plugin/lib/status")
const { resetAdapterTestHooks, setAdapterSpawnForTests } = await import("../plugin/lib/adapter")

beforeEach(() => {
  adapterCalls.length = 0
  setAdapterSpawnForTests(() => new FakeAdapterChild(adapterCalls) as never)
})

afterEach(() => resetAdapterTestHooks())

describe("eventHooks", () => {
  it("mines session on idle when session progressed", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    adapterCalls.length = 0
    const ctx = {
      session: { context: async () => [
        { type: "user", id: "u1", time: { created: 1 }, text: "Remember project decision." },
        { type: "assistant", id: "a1", time: { created: 2 }, agent: "build", model: { providerID: "test", modelID: "test" }, content: [{ type: "text", text: "Done." }] },
      ] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }
    const event = { type: "session.idle", data: { sessionID: "event-1" } }
    await eventHooks(ctx, event)
    expect(adapterCalls[0].mode).toBe("mine_messages")
    expect(getSessionState("event-1").status).toBe(AutosaveStatus.Saved)
    const status = await readStatusState()
    expect(status.counters.autosavesCompleted).toBe(1)
    expect(status.lastAutosave?.outcome).toBe("saved")
  })

  it("marks retrieval pending on normal message updates", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    const ctx = {
      session: { context: async () => [{ type: "user", id: "u2", time: { created: 1 }, text: "How do we build?" }] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }
    await eventHooks(ctx, { type: "message.updated", data: { sessionID: "event-2" } })
    expect(getSessionState("event-2").retrievalPending).toBe(true)
  })

  it("sanitizes invalid unicode surrogates before autosave mining", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    adapterCalls.length = 0
    const ctx = {
      session: { context: async () => [
        { type: "user", id: "u3", time: { created: 1 }, text: "Call me Борис\udc81" },
        { type: "assistant", id: "a3", time: { created: 2 }, agent: "build", model: { providerID: "test", modelID: "test" }, content: [{ type: "text", text: "Got it." }] },
      ] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }
    await eventHooks(ctx, { type: "session.idle", data: { sessionID: "event-3" } })

    expect(adapterCalls[0].mode).toBe("mine_messages")
    expect(adapterCalls[0].transcript).toContain("Борис")
    expect(/[\uDC00-\uDFFF]/.test(adapterCalls[0].transcript)).toBe(false)
  })

  it("skips autosave mining for tiny junk fragments", async () => {
    resetConfig()
    resetAllStates()
    await resetStatusState()
    adapterCalls.length = 0
    const ctx = {
      session: { context: async () => [
        { type: "user", id: "u4", time: { created: 1 }, text: "re." },
        { type: "assistant", id: "a4", time: { created: 2 }, agent: "build", model: { providerID: "test", modelID: "test" }, content: [{ type: "text", text: "ls>" }] },
        { type: "user", id: "u5", time: { created: 3 }, text: "fy. |" },
      ] },
      location: { project: { id: "demo", directory: "/tmp/Demo", canonical: "/tmp/Demo" } },
    }
    await eventHooks(ctx, { type: "session.idle", data: { sessionID: "event-4" } })

    expect(adapterCalls).toHaveLength(0)
    expect(getSessionState("event-4").status).toBe(AutosaveStatus.Noop)
    const status = await readStatusState()
    expect(status.lastAutosave?.outcome).toBe("skipped")
  })
})
