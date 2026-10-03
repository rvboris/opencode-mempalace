/** @jsxImportSource @opentui/solid */
import type { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { formatSessionHud, readStatusState, type StatusState } from "../lib/status"

const EMPTY_STATE: StatusState = {
  version: 2,
  updatedAt: new Date(0).toISOString(),
  counters: {
    retrievalPrompts: 0,
    retrievalSearches: 0,
    retrievalJudge: { none: 0, cited: 0, improved: 0, savedTime: 0, unknown: 0 },
    autosavesCompleted: 0,
    autosavesSkipped: 0,
    autosavesFailed: 0,
    manualWrites: 0,
  },
  helpedSessionIds: [],
  sessions: {},
}

const REFRESH_EVENTS = [
  "session.idle",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.compaction.ended",
  "session.deleted",
] as const

export const registerStatusHud = async (ctx: Plugin.Context) => {
  const [status, setStatus] = createSignal<StatusState>(EMPTY_STATE)
  let disposed = false
  let refreshing = false

  const refresh = async () => {
    if (disposed || refreshing) return
    refreshing = true
    try {
      const next = await readStatusState()
      if (!disposed) setStatus(next)
    } finally {
      refreshing = false
    }
  }

  await refresh()
  const stops = REFRESH_EVENTS.map((event) => ctx.data.on(event, () => void refresh()))
  // Server autosave can write after its event; polling also catches manual writes.
  const timer = setInterval(() => void refresh(), 2_000)
  const removeSlot = ctx.ui.slot({
    append: "prompt.footer.status",
    render(props) {
      const label = () => formatSessionHud(status(), props.sessionID ?? "")
      const accent = () => label().includes(" · fail ")
        ? ctx.theme.text.feedback.error.base
        : label().includes(" · skip ")
          ? ctx.theme.text.feedback.warning.base
          : ctx.theme.text.action.secondary.base
      return (
        <text fg={ctx.theme.text.muted}>
          <span style={{ fg: accent() }}>{label()}</span>
        </text>
      )
    },
  })

  return () => {
    disposed = true
    clearInterval(timer)
    for (const stop of stops) stop()
    removeSlot()
  }
}
