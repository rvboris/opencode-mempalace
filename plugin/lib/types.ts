import type { PluginInput } from "@opencode-ai/plugin"
import type { Event, Message, Part } from "@opencode-ai/sdk"
import {
  DEFAULT_ROOM,
  DEFAULT_TOPIC,
  DEFAULT_AGENT_NAME,
  DEFAULT_EXTRACT_MODE,
  DEFAULT_INJECTED_ITEMS,
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_LIMIT,
  DEFAULT_ADAPTER_TIMEOUT_MS,
  MAX_USER_MESSAGES_DIGEST,
  MAX_TRANSCRIPT_MESSAGES_DIGEST,
  DATE_ISO_SLICE,
  SERVICE_NAME,
  COMPACTION_CONTEXT_MESSAGE,
  ERROR_MESSAGES,
  DEFAULT_USER_WING_PREFIX,
  DEFAULT_PROJECT_WING_PREFIX,
  DEFAULT_KEYWORD_PATTERNS,
  CONFIG_PATH_SEGMENTS,
  ENV_KEYS,
  LOG_FILE_NAME,
  DIRECT_MEMPALACE_MUTATION_TOOLS,
  TOOL_DESCRIPTIONS,
  TOOL_ERROR_MESSAGES,
  LOG_MESSAGES,
  INSTRUCTION_TEXT,
} from "./constants"

export {
  DEFAULT_ROOM,
  DEFAULT_TOPIC,
  DEFAULT_AGENT_NAME,
  DEFAULT_EXTRACT_MODE,
  DEFAULT_INJECTED_ITEMS,
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_LIMIT,
  DEFAULT_ADAPTER_TIMEOUT_MS,
  DEFAULT_USER_WING_PREFIX,
  DEFAULT_PROJECT_WING_PREFIX,
  DEFAULT_KEYWORD_PATTERNS,
  CONFIG_PATH_SEGMENTS,
  ENV_KEYS,
  MAX_USER_MESSAGES_DIGEST,
  MAX_TRANSCRIPT_MESSAGES_DIGEST,
  DATE_ISO_SLICE,
  SERVICE_NAME,
  LOG_FILE_NAME,
  DIRECT_MEMPALACE_MUTATION_TOOLS,
  TOOL_DESCRIPTIONS,
  TOOL_ERROR_MESSAGES,
  LOG_MESSAGES,
  INSTRUCTION_TEXT,
  COMPACTION_CONTEXT_MESSAGE,
  ERROR_MESSAGES,
}

export const MEMORY_SCOPES = ["user", "project"] as const
export type MemoryScope = (typeof MEMORY_SCOPES)[number]

export const USER_MEMORY_ROOMS = ["preferences", "workflow", "communication"] as const
export const PROJECT_MEMORY_ROOMS = ["architecture", "workflow", "decisions", "bugs", "setup"] as const
export type KnownMemoryRoom = (typeof USER_MEMORY_ROOMS)[number] | (typeof PROJECT_MEMORY_ROOMS)[number]

export const TOOL_MEMORY_MODES = ["save", "search", "kg_add", "diary_write"] as const
export type ToolMemoryMode = (typeof TOOL_MEMORY_MODES)[number]

export const ADAPTER_MODES = ["save", "search", "kg_add", "diary_write", "mine_messages"] as const
export type AdapterMode = (typeof ADAPTER_MODES)[number]

export const SESSION_EVENT_TYPES = [
  "session.idle",
  "session.compacted",
  "session.deleted",
  "session.error",
  "session.updated",
  "message.updated",
] as const
export type SessionEventType = (typeof SESSION_EVENT_TYPES)[number]

export type AppLogLevel = "info" | "warn" | "error"

export type MessagePartLike = Part | {
  text?: string
  content?: string
}

export type MessageInfoLike = Message | {
  role?: string
  content?: string
}

export type MessageLike = {
  role?: string
  content?: string
  parts?: readonly MessagePartLike[]
  info?: MessageInfoLike
}

export type SessionMessagesResponse =
  | Awaited<ReturnType<PluginInput["client"]["session"]["messages"]>>
  | { data?: readonly MessageLike[] }
  | readonly MessageLike[]
  | null
  | undefined

export type SessionEvent = Event

export type AppLoggerClient = PluginInput["client"]

export type EventHookContext = Pick<PluginInput, "client" | "project" | "directory" | "worktree" | "$">

export type SystemHookContext = Pick<PluginInput, "client" | "project">

export type ToolContext = Pick<PluginInput, "project" | "$">

export type SaveAdapterRequest = {
  mode: "save"
  wing: string
  room?: string
  content: string
  added_by: string
}

export type SearchAdapterRequest = {
  mode: "search"
  query: string
  wing: string
  room?: string
  limit?: number
}

export type KgAddAdapterRequest = {
  mode: "kg_add"
  subject: string
  predicate: string
  object: string
  valid_from: string
  source_closet: string
}

export type DiaryWriteAdapterRequest = {
  mode: "diary_write"
  agent_name?: string
  entry: string
  topic?: string
}

export type MineMessagesAdapterRequest = {
  mode: "mine_messages"
  transcript: string
  wing: string
  extract_mode: string
  agent: string
}

export type AdapterRequest =
  | SaveAdapterRequest
  | SearchAdapterRequest
  | KgAddAdapterRequest
  | DiaryWriteAdapterRequest
  | MineMessagesAdapterRequest

export type AdapterResponse = {
  success?: boolean
  error?: string
  [key: string]: unknown
}
