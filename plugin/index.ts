import { Plugin } from "@opencode/plugin"
import type { Registration } from "@opencode/plugin/promise/registration"
import { eventHooks } from "./hooks/event"
import { systemHooks } from "./hooks/system"
import { buildMessageSnapshot, setMessageSnapshot, setPendingCompactionSnapshot } from "./lib/autosave"
import { getSessionMessages } from "./lib/opencode"
import { writeLog, setLogger } from "./lib/log"
import { COMPACTION_CONTEXT_MESSAGE } from "./lib/constants"
import { toolHooks } from "./hooks/tool"
import { mempalaceMemoryTool } from "./tools/mempalace-memory"
import { mempalaceStatusTool } from "./tools/mempalace-status"

export default Plugin.define({
  id: "mempalace",
  async setup(ctx) {
    setLogger()
    const registrations: Registration[] = []
    registrations.push(await ctx.session.hook("context", (event) => systemHooks(ctx, event, event)))
    registrations.push(await ctx.session.hook("compaction", async (event) => {
      try {
        const messages = await ctx.session.context({ sessionID: event.sessionID })
        const snapshot = buildMessageSnapshot(getSessionMessages(messages))
        setMessageSnapshot(event.sessionID, snapshot)
        setPendingCompactionSnapshot(event.sessionID, snapshot)
        event.system.push({ type: "text", text: COMPACTION_CONTEXT_MESSAGE })
      } catch (error) {
        await writeLog("ERROR", "Compaction context capture failed", { error: String(error) })
      }
    }))
    registrations.push(await ctx.tool.hook("execute.before", (event) => toolHooks(event)))
    registrations.push(await ctx.tool.transform((editor) => {
      editor.add({ ...mempalaceMemoryTool({ location: ctx.location }), name: "mempalace_memory" })
      editor.add({ ...mempalaceStatusTool(), name: "mempalace_status" })
    }))
    const controller = new AbortController()
    const eventLoop = (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          await eventHooks(ctx, event)
        }
      } catch (error) {
        if (!controller.signal.aborted) await writeLog("ERROR", "Event subscription failed", { error: String(error) })
      }
    })()
    return async () => {
      controller.abort()
      await Promise.all(registrations.map((registration) => registration.dispose()))
      await eventLoop
    }
  },
})
