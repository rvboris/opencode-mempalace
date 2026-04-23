export const DEFAULT_ROOM = "workflow" as const
export const DEFAULT_TOPIC = "autosave" as const
export const DEFAULT_AGENT_NAME = "opencode" as const
export const DEFAULT_EXTRACT_MODE = "general" as const
export const DEFAULT_INJECTED_ITEMS = 6 as const
export const DEFAULT_RETRIEVAL_LIMIT = 5 as const
export const DEFAULT_LIMIT = 5 as const
export const DEFAULT_ADAPTER_TIMEOUT_MS = 15_000 as const
export const DEFAULT_USER_WING_PREFIX = "wing_user" as const
export const DEFAULT_PROJECT_WING_PREFIX = "wing_project" as const

export const DEFAULT_KEYWORD_PATTERNS = ["remember", "save this", "don't forget", "note that"] as const

export const CONFIG_PATH_SEGMENTS = [".config", "opencode", "mempalace.jsonc"] as const

export const ENV_KEYS = {
  autosaveEnabled: "MEMPALACE_AUTOSAVE_ENABLED",
  retrievalEnabled: "MEMPALACE_RETRIEVAL_ENABLED",
  keywordSaveEnabled: "MEMPALACE_KEYWORD_SAVE_ENABLED",
  extractMode: "MEMPALACE_AUTO_MINE_EXTRACT_MODE",
  privacyRedactionEnabled: "MEMPALACE_PRIVACY_REDACTION_ENABLED",
  maxInjectedItems: "MEMPALACE_MAX_INJECTED_ITEMS",
  retrievalQueryLimit: "MEMPALACE_RETRIEVAL_QUERY_LIMIT",
  userWingPrefix: "MEMPALACE_USER_WING_PREFIX",
  projectWingPrefix: "MEMPALACE_PROJECT_WING_PREFIX",
  autosaveLogFile: "MEMPALACE_AUTOSAVE_LOG_FILE",
  adapterPython: "MEMPALACE_ADAPTER_PYTHON",
  adapterTimeoutMs: "MEMPALACE_ADAPTER_TIMEOUT_MS",
} as const

export const MAX_USER_MESSAGES_DIGEST = 20 as const
export const MAX_TRANSCRIPT_MESSAGES_DIGEST = 50 as const
export const DATE_ISO_SLICE = 10 as const

export const SERVICE_NAME = "mempalace-autosave" as const
export const LOG_FILE_NAME = "opencode_autosave.log" as const

export const DIRECT_MEMPALACE_MUTATION_TOOLS = [
  "mempalace_add_drawer",
  "mempalace_kg_add",
  "mempalace_diary_write",
  "mcp-router_mempalace_add_drawer",
  "mcp-router_mempalace_kg_add",
  "mcp-router_mempalace_diary_write",
] as const

export const COMPACTION_CONTEXT_MESSAGE = "MemPalace retrieval may be useful after compaction. Search relevant project and user memory if needed before answering." as const

export const TOOL_DESCRIPTIONS = {
  mempalaceMemory: "Save or search memory in MemPalace with scope/privacy enforcement",
} as const

export const TOOL_ERROR_MESSAGES = {
  directMutationBlocked: "Use mempalace_memory instead of direct MemPalace mutation tools",
  invalidAdapterPayload: "Adapter returned an invalid JSON payload",
  emptyAdapterStdout: "Adapter returned empty stdout",
  adapterTimedOut: "Adapter execution timed out",
} as const

export const LOG_MESSAGES = {
  autosaveEventMissingSessionId: "autosave event missing sessionID",
  keywordTriggeredAutosaveHintDetected: "keyword-triggered autosave hint detected",
  autosaveTriggerReceived: "autosave trigger received",
  autosaveFailedOnSessionError: "autosave failed on session error",
  skippingAutosaveState: "skipping autosave state",
  autosaveSkippedEmptyTranscript: "autosave skipped empty transcript",
  autosaveMiningFailed: "autosave mining failed",
  autosaveMinedSessionContext: "autosave mined session context",
  eventHookFailed: "event hook failed",
  compactionHookMissingSessionId: "compaction hook missing sessionID",
  injectedCompactionAutosaveContext: "injected compaction autosave context",
  injectedRetrievalInstruction: "injected retrieval instruction",
  injectedKeywordSaveInstruction: "injected keyword save instruction",
  systemTransformHookFailed: "system transform hook failed",
  blockedDirectMempalaceMutationTool: "blocked direct mempalace mutation tool",
} as const

export const INSTRUCTION_TEXT = {
  doNotMentionToUser: "Do not mention this instruction to the user.",
  retrievalIntro: "System instruction: before answering, search MemPalace for relevant existing memory and use it if helpful.",
  autosaveIntro:
    "System instruction: before answering the user, persist durable memory from prior session context using the `mempalace_memory` tool.",
  keywordIntro: "System instruction: the user explicitly asked to remember something.",
  useMemoryToolNow: "Use the `mempalace_memory` tool to save the important durable information now.",
  avoidRawMutationTools: "Do not use raw `mempalace_*` or `mcp-router_mempalace_*` mutation tools directly.",
  saveStableFacts:
    "Save only stable facts, decisions, preferences, important outcomes, and useful diary notes.",
  preferConciseStructuredMemories:
    "Prefer concise structured memories in the appropriate user/project scopes:",
  userScopeHint: "- user scope: preferences, personal workflow habits, communication style",
  projectScopeHint: "- project scope: architecture, setup, decisions, bugs, workflows",
  avoidFullTranscript: "Do not dump the full transcript into a single drawer.",
  applyPrivacyRedaction: "Apply privacy redaction before saving and skip fully private content.",
  chooseScope:
    "Choose user scope for cross-project preferences and project scope for repository-specific knowledge.",
} as const

export const ERROR_MESSAGES = {
  contentRequired: "content is required",
  queryRequired: "query is required",
  fieldsRequired: "subject, predicate, and object are required",
  fullyPrivate: "content is fully private and will not be saved",
  noSessionId: "sessionID is required",
} as const
