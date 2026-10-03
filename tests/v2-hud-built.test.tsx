/** @jsxImportSource @opentui/solid */
import { expect, it } from "bun:test"
import type { Plugin } from "@opencode/plugin/tui"

type Context = Plugin.Context
type HudClaim = Extract<Parameters<Context["ui"]["slot"]>[0], { append: "prompt.footer.status" }>
import { testRender } from "@opentui/solid"
import { RGBA } from "@opentui/core"
import { createSignal } from "solid-js"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"

// No preload: this verifies the shipped JavaScript, not a test-time JSX transform.
// Run with: bun run build && bun test --conditions=browser tests/v2-hud-built.test.tsx
import plugin from "../dist/plugin/tui/index.js"
import { recordAutosave, resetStatusState } from "../plugin/lib/status"

it("built HUD registers the V2 slot, reacts to session/status changes, and disposes resources", async () => {
  const previous = process.env.MEMPALACE_STATUS_FILE
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mempalace-v2-hud-"))
  process.env.MEMPALACE_STATUS_FILE = path.join(directory, "status.json")
  const events = new Map<string, () => void>()
  let claim: HudClaim | undefined
  let removed = false
  const color = RGBA.fromHex("#abcdef")
  const ctx = {
    data: {
      on(event: string, callback: () => void) {
        events.set(event, callback)
        return () => { events.delete(event) }
      },
    },
    ui: {
      slot(value: HudClaim) {
        claim = value
        return () => { removed = true }
      },
    },
    theme: {
      text: {
        muted: color,
        action: { secondary: { base: color } },
        feedback: { error: { base: color }, warning: { base: color } },
      },
    },
  } as unknown as Context
  let cleanup: (() => void | Promise<void>) | void
  let view: Awaited<ReturnType<typeof testRender>> | undefined
  try {
    await resetStatusState()
    await recordAutosave({ sessionId: "failed", outcome: "failed", reason: "test" })
    cleanup = await plugin.setup(ctx)
    expect(plugin.id).toBe("rvboris.mempalace-hud")
    expect(claim?.append).toBe("prompt.footer.status")
    expect(events.has("session.execution.succeeded")).toBe(true)
    expect(events.has("session.idle")).toBe(true)
    const [sessionID, setSessionID] = createSignal<string | undefined>("failed")
    view = await testRender(() => claim!.render({
      get sessionID() { return sessionID() },
      mode: "normal",
      showDetails: true,
    }), { width: 60, height: 3 })
    const frame = async () => {
      await view!.renderOnce()
      return view!.captureCharFrame()
    }
    expect(await frame()).toContain("· fail 1")
    setSessionID("other")
    expect(await frame()).toContain("MEM quiet")
    await recordAutosave({ sessionId: "other", outcome: "skipped", reason: "duplicate" })
    events.get("session.execution.succeeded")!()
    await Bun.sleep(30)
    expect(await frame()).toContain("· skip 1")
    // A later server-side write has no further event: the timer must catch it.
    await recordAutosave({ sessionId: "other", outcome: "failed", reason: "late write" })
    await Bun.sleep(2_100)
    expect(await frame()).toContain("· fail 1")
    setSessionID(undefined)
    expect(await frame()).toContain("MEM quiet")
    setSessionID("other")
    const beforeDisposal = await frame()
    await cleanup?.()
    cleanup = undefined
    expect(removed).toBe(true)
    expect(events.size).toBe(0)
    await recordAutosave({ sessionId: "other", outcome: "skipped", reason: "after disposal" })
    await Bun.sleep(2_100)
    expect(await frame()).toBe(beforeDisposal)
  } finally {
    await cleanup?.()
    view?.renderer.destroy()
    if (previous === undefined) delete process.env.MEMPALACE_STATUS_FILE
    else process.env.MEMPALACE_STATUS_FILE = previous
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 10_000)
