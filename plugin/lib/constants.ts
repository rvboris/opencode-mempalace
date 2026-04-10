export const DEFAULT_ROOM = "workflow" as const
export const DEFAULT_TOPIC = "autosave" as const
export const DEFAULT_AGENT_NAME = "opencode" as const
export const DEFAULT_EXTRACT_MODE = "general" as const
export const DEFAULT_INJECTED_ITEMS = 6 as const
export const DEFAULT_RETRIEVAL_LIMIT = 5 as const
export const DEFAULT_LIMIT = 5 as const

export const MAX_USER_MESSAGES_DIGEST = 20 as const
export const MAX_TRANSCRIPT_MESSAGES_DIGEST = 50 as const
export const DATE_ISO_SLICE = 10 as const

export const SERVICE_NAME = "mempalace-autosave" as const

export const COMPACTION_CONTEXT_MESSAGE = "MemPalace retrieval may be useful after compaction. Search relevant project and user memory if needed before answering." as const

export const ERROR_MESSAGES = {
  contentRequired: "content is required",
  queryRequired: "query is required",
  fieldsRequired: "subject, predicate, and object are required",
  fullyPrivate: "content is fully private and will not be saved",
  noSessionId: "sessionID is required",
} as const