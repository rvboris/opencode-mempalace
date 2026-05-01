import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ENV_KEYS, STATUS_FILE_NAME } from "./constants"
import type { AdapterResponse, MemoryScope } from "./types"

export type StatusCounters = {
  retrievalPrompts: number
  retrievalSearches: number
  retrievalHits: number
  autosavesCompleted: number
  autosavesSkipped: number
  autosavesFailed: number
  manualWrites: number
}

export type StatusSessionCounters = {
  retrievalSearches: number
  retrievalHits: number
  autosavesCompleted: number
  autosavesSkipped: number
  autosavesFailed: number
  manualWrites: number
}

export type StatusRetrievalPrompt = {
  sessionId?: string
  timestamp: string
  queryPreview: string
}

export type StatusRetrieval = {
  sessionId?: string
  timestamp: string
  scope: MemoryScope
  room?: string
  queryPreview: string
  resultCount?: number
  previews: string[]
}

export type StatusAutosaveOutcome = "saved" | "skipped" | "failed"

export type StatusAutosave = {
  sessionId: string
  timestamp: string
  outcome: StatusAutosaveOutcome
  reason: string
  wing?: string
  sourcePreview?: string
}

export type StatusWrite = {
  timestamp: string
  mode: "save" | "kg_add" | "diary_write"
  scope?: MemoryScope
  room?: string
  preview: string
}

export type StatusSessionState = {
  updatedAt: string
  counters: StatusSessionCounters
  lastRetrievalPrompt?: StatusRetrievalPrompt
  lastRetrieval?: StatusRetrieval
  lastAutosave?: StatusAutosave
  lastWrite?: StatusWrite
}

export type StatusState = {
  version: 2
  updatedAt: string
  counters: StatusCounters
  helpedSessionIds: string[]
  sessions: Record<string, StatusSessionState>
  lastRetrievalPrompt?: StatusRetrievalPrompt
  lastRetrieval?: StatusRetrieval
  lastAutosave?: StatusAutosave
  lastWrite?: StatusWrite
}

type SearchResultSummary = {
  resultCount?: number
  previews: string[]
}

const MAX_SESSION_IDS = 50
const MAX_PREVIEWS = 3
const MAX_PREVIEW_LENGTH = 140

const DEFAULT_SESSION_COUNTERS = (): StatusSessionCounters => ({
  retrievalSearches: 0,
  retrievalHits: 0,
  autosavesCompleted: 0,
  autosavesSkipped: 0,
  autosavesFailed: 0,
  manualWrites: 0,
})

const DEFAULT_SESSION_STATE = (): StatusSessionState => ({
  updatedAt: new Date(0).toISOString(),
  counters: DEFAULT_SESSION_COUNTERS(),
})

const DEFAULT_STATE = (): StatusState => ({
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
})

let writeQueue = Promise.resolve()

const getStatusFilePath = () => {
  return process.env[ENV_KEYS.statusFile] || path.join(os.homedir(), ".mempalace", STATUS_FILE_NAME)
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const normalizeString = (value: unknown) => {
  if (typeof value !== "string") return undefined
  const normalized = value.replace(/\s+/g, " ").trim()
  return normalized || undefined
}

const previewText = (value: string | undefined) => {
  if (!value) return ""
  const normalized = value.replace(/\s+/g, " ").trim()
  if (normalized.length <= MAX_PREVIEW_LENGTH) return normalized
  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
}

const readStringArray = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item))
}

const readCounters = (value: unknown): StatusCounters => {
  const input = isRecord(value) ? value : {}
  const readCount = (key: keyof StatusCounters) => {
    const item = input[key]
    return typeof item === "number" && Number.isFinite(item) && item >= 0 ? Math.floor(item) : 0
  }
  return {
    retrievalPrompts: readCount("retrievalPrompts"),
    retrievalSearches: readCount("retrievalSearches"),
    retrievalHits: readCount("retrievalHits"),
    autosavesCompleted: readCount("autosavesCompleted"),
    autosavesSkipped: readCount("autosavesSkipped"),
    autosavesFailed: readCount("autosavesFailed"),
    manualWrites: readCount("manualWrites"),
  }
}

const readSessionCounters = (value: unknown): StatusSessionCounters => {
  const input = isRecord(value) ? value : {}
  const readCount = (key: keyof StatusSessionCounters) => {
    const item = input[key]
    return typeof item === "number" && Number.isFinite(item) && item >= 0 ? Math.floor(item) : 0
  }
  return {
    retrievalSearches: readCount("retrievalSearches"),
    retrievalHits: readCount("retrievalHits"),
    autosavesCompleted: readCount("autosavesCompleted"),
    autosavesSkipped: readCount("autosavesSkipped"),
    autosavesFailed: readCount("autosavesFailed"),
    manualWrites: readCount("manualWrites"),
  }
}

const readRetrievalPrompt = (value: unknown): StatusRetrievalPrompt | undefined => {
  if (!isRecord(value)) return undefined
  const timestamp = normalizeString(value.timestamp)
  const queryPreview = normalizeString(value.queryPreview)
  if (!timestamp || !queryPreview) return undefined
  return {
    sessionId: normalizeString(value.sessionId),
    timestamp,
    queryPreview,
  }
}

const readRetrieval = (value: unknown): StatusRetrieval | undefined => {
  if (!isRecord(value)) return undefined
  const timestamp = normalizeString(value.timestamp)
  const scope = value.scope === "user" || value.scope === "project" ? value.scope : undefined
  const queryPreview = normalizeString(value.queryPreview)
  if (!timestamp || !scope || !queryPreview) return undefined
  const count = typeof value.resultCount === "number" && Number.isFinite(value.resultCount) && value.resultCount >= 0
    ? Math.floor(value.resultCount)
    : undefined
  return {
    sessionId: normalizeString(value.sessionId),
    timestamp,
    scope,
    room: normalizeString(value.room),
    queryPreview,
    resultCount: count,
    previews: readStringArray(value.previews).slice(0, MAX_PREVIEWS),
  }
}

const readAutosave = (value: unknown): StatusAutosave | undefined => {
  if (!isRecord(value)) return undefined
  const timestamp = normalizeString(value.timestamp)
  const sessionId = normalizeString(value.sessionId)
  const reason = normalizeString(value.reason)
  const outcome = value.outcome === "saved" || value.outcome === "skipped" || value.outcome === "failed"
    ? value.outcome
    : undefined
  if (!timestamp || !sessionId || !reason || !outcome) return undefined
  return {
    sessionId,
    timestamp,
    outcome,
    reason,
    wing: normalizeString(value.wing),
    sourcePreview: normalizeString(value.sourcePreview),
  }
}

const readWrite = (value: unknown): StatusWrite | undefined => {
  if (!isRecord(value)) return undefined
  const timestamp = normalizeString(value.timestamp)
  const preview = normalizeString(value.preview)
  const mode = value.mode === "save" || value.mode === "kg_add" || value.mode === "diary_write" ? value.mode : undefined
  if (!timestamp || !preview || !mode) return undefined
  return {
    timestamp,
    mode,
    scope: value.scope === "user" || value.scope === "project" ? value.scope : undefined,
    room: normalizeString(value.room),
    preview,
  }
}

const readSessionState = (value: unknown): StatusSessionState | undefined => {
  if (!isRecord(value)) return undefined
  return {
    updatedAt: normalizeString(value.updatedAt) || new Date(0).toISOString(),
    counters: readSessionCounters(value.counters),
    lastRetrievalPrompt: readRetrievalPrompt(value.lastRetrievalPrompt),
    lastRetrieval: readRetrieval(value.lastRetrieval),
    lastAutosave: readAutosave(value.lastAutosave),
    lastWrite: readWrite(value.lastWrite),
  }
}

const readSessions = (value: unknown) => {
  if (!isRecord(value)) return {}
  const sessions = Object.entries(value)
    .map(([sessionId, sessionState]) => {
      const normalizedSessionId = normalizeString(sessionId)
      const parsed = readSessionState(sessionState)
      if (!normalizedSessionId || !parsed) return undefined
      return [normalizedSessionId, parsed] as const
    })
    .filter((entry): entry is readonly [string, StatusSessionState] => Boolean(entry))
    .sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))
    .slice(-MAX_SESSION_IDS)
  return Object.fromEntries(sessions)
}

const parseState = (value: unknown): StatusState => {
  if (!isRecord(value)) return DEFAULT_STATE()
  return {
    version: 2,
    updatedAt: normalizeString(value.updatedAt) || new Date(0).toISOString(),
    counters: readCounters(value.counters),
    helpedSessionIds: readStringArray(value.helpedSessionIds).slice(-MAX_SESSION_IDS),
    sessions: readSessions(value.sessions),
    lastRetrievalPrompt: readRetrievalPrompt(value.lastRetrievalPrompt),
    lastRetrieval: readRetrieval(value.lastRetrieval),
    lastAutosave: readAutosave(value.lastAutosave),
    lastWrite: readWrite(value.lastWrite),
  }
}

const loadState = async () => {
  try {
    const raw = await fs.readFile(getStatusFilePath(), "utf8")
    return parseState(JSON.parse(raw) as unknown)
  } catch {
    return DEFAULT_STATE()
  }
}

const persistState = async (state: StatusState) => {
  const filePath = getStatusFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8")
}

const updateState = async (updater: (state: StatusState) => void) => {
  writeQueue = writeQueue.then(async () => {
    const state = await loadState()
    updater(state)
    state.updatedAt = new Date().toISOString()
    await persistState(state)
  }).catch(() => {})
  await writeQueue
}

const addHelpedSession = (state: StatusState, sessionId: string | undefined) => {
  if (!sessionId || state.helpedSessionIds.includes(sessionId)) return
  state.helpedSessionIds.push(sessionId)
  if (state.helpedSessionIds.length > MAX_SESSION_IDS) {
    state.helpedSessionIds.splice(0, state.helpedSessionIds.length - MAX_SESSION_IDS)
  }
}

const updateSessionState = (
  state: StatusState,
  sessionId: string | undefined,
  updater: (sessionState: StatusSessionState) => void,
) => {
  if (!sessionId) return
  const sessionState = state.sessions[sessionId] ?? DEFAULT_SESSION_STATE()
  updater(sessionState)
  sessionState.updatedAt = new Date().toISOString()
  state.sessions[sessionId] = sessionState

  const entries = Object.entries(state.sessions)
  if (entries.length <= MAX_SESSION_IDS) return
  entries.sort((a, b) => a[1].updatedAt.localeCompare(b[1].updatedAt))
  state.sessions = Object.fromEntries(entries.slice(-MAX_SESSION_IDS))
}

const collectCandidateTexts = (value: unknown, bucket: string[]) => {
  if (bucket.length >= MAX_PREVIEWS) return
  if (typeof value === "string") {
    const preview = previewText(value)
    if (preview) bucket.push(preview)
    return
  }
  if (!isRecord(value)) return
  for (const key of ["content", "text", "entry", "summary", "memory", "drawer", "object"]) {
    const preview = previewText(normalizeString(value[key]))
    if (preview) {
      bucket.push(preview)
      return
    }
  }
}

const extractResultArray = (result: AdapterResponse) => {
  for (const key of ["results", "items", "matches", "entries", "drawers", "data"]) {
    const value = result[key]
    if (Array.isArray(value)) return value
  }
  return undefined
}

export const summarizeSearchResult = (result: AdapterResponse): SearchResultSummary => {
  const array = extractResultArray(result)
  const previews: string[] = []
  if (array) {
    for (const item of array) {
      collectCandidateTexts(item, previews)
      if (previews.length >= MAX_PREVIEWS) break
    }
  }
  return {
    resultCount: array?.length,
    previews,
  }
}

export const recordRetrievalPrompt = async (input: { sessionId?: string; queryPreview: string }) => {
  await updateState((state) => {
    state.counters.retrievalPrompts += 1
    state.lastRetrievalPrompt = {
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
      queryPreview: previewText(input.queryPreview),
    }
    updateSessionState(state, input.sessionId, (sessionState) => {
      sessionState.lastRetrievalPrompt = state.lastRetrievalPrompt
    })
  })
}

export const recordRetrievalSearch = async (input: {
  sessionId?: string
  scope: MemoryScope
  room?: string
  query: string
  result: AdapterResponse
}) => {
  const summary = summarizeSearchResult(input.result)
  await updateState((state) => {
    state.counters.retrievalSearches += 1
    if ((summary.resultCount ?? 0) > 0) {
      state.counters.retrievalHits += 1
      addHelpedSession(state, input.sessionId)
    }
    state.lastRetrieval = {
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
      scope: input.scope,
      room: input.room,
      queryPreview: previewText(input.query),
      resultCount: summary.resultCount,
      previews: summary.previews,
    }
    updateSessionState(state, input.sessionId, (sessionState) => {
      sessionState.counters.retrievalSearches += 1
      if ((summary.resultCount ?? 0) > 0) {
        sessionState.counters.retrievalHits += 1
      }
      sessionState.lastRetrieval = state.lastRetrieval
    })
  })
}

export const recordMemoryWrite = async (input: {
  sessionId?: string
  mode: "save" | "kg_add" | "diary_write"
  scope?: MemoryScope
  room?: string
  preview: string
}) => {
  await updateState((state) => {
    state.counters.manualWrites += 1
    state.lastWrite = {
      timestamp: new Date().toISOString(),
      mode: input.mode,
      scope: input.scope,
      room: input.room,
      preview: previewText(input.preview),
    }
    updateSessionState(state, input.sessionId, (sessionState) => {
      sessionState.counters.manualWrites += 1
      sessionState.lastWrite = state.lastWrite
    })
  })
}

export const recordAutosave = async (input: {
  sessionId: string
  outcome: StatusAutosaveOutcome
  reason: string
  wing?: string
  sourcePreview?: string
}) => {
  await updateState((state) => {
    if (input.outcome === "saved") state.counters.autosavesCompleted += 1
    if (input.outcome === "skipped") state.counters.autosavesSkipped += 1
    if (input.outcome === "failed") state.counters.autosavesFailed += 1
    state.lastAutosave = {
      sessionId: input.sessionId,
      timestamp: new Date().toISOString(),
      outcome: input.outcome,
      reason: input.reason,
      wing: input.wing,
      sourcePreview: previewText(input.sourcePreview),
    }
    updateSessionState(state, input.sessionId, (sessionState) => {
      if (input.outcome === "saved") sessionState.counters.autosavesCompleted += 1
      if (input.outcome === "skipped") sessionState.counters.autosavesSkipped += 1
      if (input.outcome === "failed") sessionState.counters.autosavesFailed += 1
      sessionState.lastAutosave = state.lastAutosave
    })
  })
}

export const readStatusState = async () => {
  await writeQueue
  return loadState()
}

export const resetStatusState = async () => {
  writeQueue = Promise.resolve()
  try {
    await fs.unlink(getStatusFilePath())
  } catch {
    // ignore missing file in tests
  }
}

const isCurrentSession = (expectedSessionId: string | undefined, actualSessionId: string | undefined) => {
  return Boolean(expectedSessionId && actualSessionId && expectedSessionId === actualSessionId)
}

export const formatSessionHud = (state: StatusState, sessionId: string) => {
  const sessionState = state.sessions[sessionId]
  if (!sessionState) return "MEM no activity yet"

  const parts = [
    `hits ${sessionState.counters.retrievalHits}`,
    `saved ${sessionState.counters.autosavesCompleted}`,
    `failed ${sessionState.counters.autosavesFailed}`,
  ]

  if (sessionState.counters.autosavesSkipped > 0) {
    parts.push(`skipped ${sessionState.counters.autosavesSkipped}`)
  }
  if (sessionState.counters.manualWrites > 0) {
    parts.push(`writes ${sessionState.counters.manualWrites}`)
  }

  if (sessionState.lastAutosave?.outcome === "failed") {
    return `MEM FAILED · ${parts.join(" · ")}`
  }
  if (sessionState.lastAutosave?.outcome === "skipped") {
    return `MEM SKIPPED · ${parts.join(" · ")}`
  }

  return `MEM ${parts.join(" · ")}`
}

const pushRetrievalLines = (lines: string[], retrieval: StatusRetrieval | StatusRetrievalPrompt, verbose: boolean) => {
  if ("scope" in retrieval) {
    const count = retrieval.resultCount
    if (count && count > 0) {
      lines.push(`- Memory lookup: found ${count} relevant ${count === 1 ? "memory" : "memories"}.`)
    } else if (count === 0) {
      lines.push("- Memory lookup: no relevant memory found.")
    } else {
      lines.push("- Memory lookup: search completed; result count unavailable.")
    }
    lines.push(`- Query: ${retrieval.queryPreview}`)
    if (verbose && retrieval.previews.length) {
      lines.push("- Relevant memories:")
      for (const preview of retrieval.previews) {
        lines.push(`  - ${preview}`)
      }
    }
    return
  }

  lines.push("- Memory lookup: retrieval prompt was prepared but no visible search result is recorded yet.")
  lines.push(`- Query: ${retrieval.queryPreview}`)
}

const pushAutosaveLines = (lines: string[], autosave: StatusAutosave) => {
  const outcome = autosave.outcome === "saved"
    ? "saved session context"
    : autosave.outcome === "skipped"
      ? "skipped"
      : "failed"
  lines.push(`- Autosave: ${outcome} after ${autosave.reason}.`)
  if (autosave.sourcePreview) {
    lines.push(`- Source context: ${autosave.sourcePreview}`)
  }
}

const compactRetrievalSummary = (retrieval: StatusRetrieval | StatusRetrievalPrompt | undefined) => {
  if (!retrieval) return "no memory lookup recorded"
  if ("scope" in retrieval) {
    const count = retrieval.resultCount
    if (count && count > 0) return `${count} relevant ${count === 1 ? "memory" : "memories"} found`
    if (count === 0) return "no relevant memory found"
    return "memory lookup completed"
  }
  return "retrieval prompt prepared"
}

const compactAutosaveSummary = (autosave: StatusAutosave | undefined) => {
  if (!autosave) return "no autosave recorded"
  if (autosave.outcome === "saved") return `autosave saved after ${autosave.reason}`
  if (autosave.outcome === "skipped") return `autosave skipped after ${autosave.reason}`
  return `autosave failed after ${autosave.reason}`
}

export const formatStatusSummary = (
  state: StatusState,
  sessionId?: string,
  options: { verbose?: boolean; compact?: boolean } = {},
) => {
  const verbose = options.verbose ?? false
  const compact = options.compact ?? false
  const lines = ["MemPalace status"]

  if (!state.lastRetrieval && !state.lastAutosave && !state.lastWrite && !state.lastRetrievalPrompt) {
    lines.push("- No visible retrieval or autosave activity recorded yet.")
    return lines.join("\n")
  }

  const currentRetrieval = state.lastRetrieval && isCurrentSession(sessionId, state.lastRetrieval.sessionId)
    ? state.lastRetrieval
    : !state.lastRetrieval && state.lastRetrievalPrompt && isCurrentSession(sessionId, state.lastRetrievalPrompt.sessionId)
      ? state.lastRetrievalPrompt
      : undefined
  const lastRetrieval = state.lastRetrieval && !isCurrentSession(sessionId, state.lastRetrieval.sessionId)
    ? state.lastRetrieval
    : !state.lastRetrieval && state.lastRetrievalPrompt && !isCurrentSession(sessionId, state.lastRetrievalPrompt.sessionId)
      ? state.lastRetrievalPrompt
      : undefined
  const currentAutosave = state.lastAutosave && isCurrentSession(sessionId, state.lastAutosave.sessionId)
    ? state.lastAutosave
    : undefined
  const lastAutosave = state.lastAutosave && !isCurrentSession(sessionId, state.lastAutosave.sessionId)
    ? state.lastAutosave
    : undefined

  if (compact) {
    lines.push(`- Current session: ${compactRetrievalSummary(currentRetrieval)}; ${compactAutosaveSummary(currentAutosave)}.`)
    lines.push(`- Last activity: ${compactRetrievalSummary(lastRetrieval)}; ${compactAutosaveSummary(lastAutosave)}.`)
    if (state.lastWrite) {
      lines.push(`- Last write: ${state.lastWrite.mode} \`${state.lastWrite.preview}\`.`)
    }
    return lines.join("\n")
  }

  const currentLines: string[] = []
  const lastLines: string[] = []

  if (currentRetrieval) pushRetrievalLines(currentLines, currentRetrieval, verbose)
  if (lastRetrieval) pushRetrievalLines(lastLines, lastRetrieval, verbose)
  if (currentAutosave) pushAutosaveLines(currentLines, currentAutosave)
  if (lastAutosave) pushAutosaveLines(lastLines, lastAutosave)

  lines.push("Current session")
  if (currentLines.length) {
    lines.push(...currentLines)
  } else {
    lines.push("- No retrieval or autosave recorded for this session yet.")
  }

  lines.push("Last activity")
  if (lastLines.length) {
    lines.push(...lastLines)
  } else {
    lines.push("- No separate past retrieval or autosave activity recorded.")
  }

  if (state.lastWrite) {
    lines.push(`- Last explicit memory write: ${state.lastWrite.mode} stored \`${state.lastWrite.preview}\`.`)
  }

  lines.push("- Totals:")
  lines.push(`  retrieval prompts: ${state.counters.retrievalPrompts}`)
  lines.push(`  retrieval searches: ${state.counters.retrievalSearches}`)
  lines.push(`  retrieval hits: ${state.counters.retrievalHits}`)
  lines.push(`  autosaves completed: ${state.counters.autosavesCompleted}`)
  lines.push(`  autosaves skipped: ${state.counters.autosavesSkipped}`)
  lines.push(`  autosaves failed: ${state.counters.autosavesFailed}`)
  lines.push(`  manual writes: ${state.counters.manualWrites}`)

  return lines.join("\n")
}
