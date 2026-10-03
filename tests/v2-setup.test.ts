import { afterEach, describe, expect, test, mock } from "bun:test"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"
import { resetAllStates } from "../plugin/lib/autosave"
import { resetStatusState, readStatusState } from "../plugin/lib/status"
import { resetConfig } from "../plugin/lib/config"
import { OpenCode } from "@opencode/client/promise"
import type { Plugin } from "@opencode/plugin/promise/plugin"

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mempalace-v2-setup-"))
process.env.MEMPALACE_STATUS_FILE = path.join(dir, "status.json")

const adapterCalls: unknown[] = []
mock.module("../plugin/lib/adapter", () => ({ executeAdapter: async (_shell: unknown, request: unknown) => { adapterCalls.push(request); return { success: true } } }))
const { default: plugin } = await import("../plugin/index")
const installedPlugin: Plugin = plugin

afterEach(async () => {
  resetAllStates()
  resetConfig()
  await resetStatusState()
})

describe("V2 plugin setup", () => {
  test("processes full typed event, registers hooks/tools, and aborts/disposes on cleanup", async () => {
    const sessionID = "setup-idle"
    const registeredHooks: string[] = []
    const registeredTools: string[] = []
    const disposals: string[] = []
    let eventSignal: AbortSignal | undefined
    let pushEvent: ((event: OpenCode.EventSubscribeOutput) => void) | undefined
    let finish: (() => void) | undefined
    const stream = async function* (signal: AbortSignal): AsyncGenerator<OpenCode.EventSubscribeOutput> {
      eventSignal = signal
      const queue: OpenCode.EventSubscribeOutput[] = []
      let wake: (() => void) | undefined
      pushEvent = (event) => { queue.push(event); wake?.() }
      signal.addEventListener("abort", () => { finish?.(); wake?.() }, { once: true })
      try {
        while (!signal.aborted) {
          if (queue.length) { yield queue.shift()!; continue }
          await new Promise<void>((resolve) => { wake = resolve; finish = resolve })
        }
      } finally { finish?.() }
    }
    const ctx = {
      location: { project: { id: "p", directory: dir, canonical: dir } },
      session: {
        hook: async (name: string, _callback: unknown) => { registeredHooks.push(`session:${name}`); return { dispose: async () => { disposals.push(`session:${name}`) } } },
        context: async () => [
          { type: "user" as const, id: "u", time: { created: 1 }, text: "Remember this useful project decision for the team." },
          { type: "assistant" as const, id: "a", time: { created: 2 }, agent: "a", model: { providerID: "p", modelID: "m" }, content: [{ type: "text" as const, text: "We chose a durable approach for the implementation." }] },
        ],
      },
      event: { subscribe: ({ signal }: { signal: AbortSignal }) => ({ [Symbol.asyncIterator]: () => stream(signal)[Symbol.asyncIterator]() }) },
      tool: {
        hook: async (name: string, _callback: unknown) => { registeredHooks.push(`tool:${name}`); return { dispose: async () => { disposals.push(`tool:${name}`) } } },
        transform: async (callback: (editor: { add(tool: { name: string }): void }) => void) => {
          callback({ add: (tool) => registeredTools.push(tool.name) })
          return { dispose: async () => { disposals.push("transform") } }
        },
      },
    }
    const cleanup = await installedPlugin.setup(ctx as never)
    expect(registeredHooks).toEqual(["session:context", "session:compaction", "tool:execute.before"])
    expect(registeredTools).toEqual(["mempalace_memory", "mempalace_status"])
    expect(eventSignal?.aborted).toBe(false)
    pushEvent?.({ id: "e", created: 3, type: "session.idle", data: { sessionID } })
    for (let i = 0; i < 100 && !(await readStatusState()).counters.autosavesCompleted; i++) await new Promise((r) => setTimeout(r, 10))
    expect((await readStatusState()).counters.autosavesCompleted).toBe(1)
    expect(adapterCalls).toHaveLength(1)
    await cleanup?.()
    expect(eventSignal?.aborted).toBe(true)
    expect(disposals.sort()).toEqual(["session:compaction", "session:context", "tool:execute.before", "transform"].sort())
  })
})
