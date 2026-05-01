/** @jsxImportSource @opentui/solid */
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { createSignal } from "solid-js"
import { formatSessionHud, readStatusState, type StatusState } from "../lib/status"

const EMPTY_STATE: StatusState = {
  version: 2,
  updatedAt: new Date(0).toISOString(),
  counters: {
    retrievalPrompts: 0,
    retrievalSearches: 0,
    retrievalHits: 0,
    autosavesCompleted: 0,
    autosavesSkipped: 0,
    autosavesFailed: 0,
    manualWrites: 0,
  },
  helpedSessionIds: [],
  sessions: {},
}

const REFRESH_EVENTS = [
  "message.updated",
  "message.part.updated",
  "session.idle",
  "session.compacted",
  "session.error",
  "session.deleted",
] as const

export const registerStatusHud = async (api: TuiPluginApi) => {
  const [status, setStatus] = createSignal<StatusState>(EMPTY_STATE)

  const refresh = async () => {
    setStatus(await readStatusState())
  }

  await refresh()

  for (const eventType of REFRESH_EVENTS) {
    const dispose = api.event.on(eventType, () => {
      void refresh()
    })
    api.lifecycle.onDispose(dispose)
  }

  api.slots.register({
    slots: {
      session_prompt_right(ctx, props) {
        const label = formatSessionHud(status(), props.session_id)
        const isFailed = label.startsWith("MEM FAILED")
        const isSkipped = label.startsWith("MEM SKIPPED")
        const accent = isFailed
          ? ctx.theme.current.error
          : isSkipped
            ? ctx.theme.current.warning
            : ctx.theme.current.secondary ?? ctx.theme.current.primary
        return (
          <text fg={ctx.theme.current.textMuted}>
            <span style={{ fg: accent }}>MEM</span>
            {` ${label.slice(4)}`}
          </text>
        )
      },
    },
  })
}
