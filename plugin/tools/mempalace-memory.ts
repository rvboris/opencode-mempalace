import { tool } from "@opencode-ai/plugin"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { sanitizeText } from "../lib/derive"
import { isFullyPrivate, redactSecrets } from "../lib/privacy"
import { getProjectScope, getUserScope } from "../lib/scope"
import { MEMORY_SCOPES, TOOL_MEMORY_MODES, type MemoryScope, type ToolContext } from "../lib/types"
import { DEFAULT_ROOM, DEFAULT_TOPIC, DEFAULT_AGENT_NAME, DATE_ISO_SLICE, DEFAULT_LIMIT, ERROR_MESSAGES } from "../lib/constants"

type SaveArgs = {
  mode: "save"
  scope?: MemoryScope
  room?: string
  content?: string
}

type SearchArgs = {
  mode: "search"
  scope?: MemoryScope
  room?: string
  query?: string
  limit?: number
}

type KgAddArgs = {
  mode: "kg_add"
  scope?: MemoryScope
  subject?: string
  predicate?: string
  object?: string
}

type DiaryWriteArgs = {
  mode: "diary_write"
  scope?: MemoryScope
  content?: string
  topic?: string
  agent_name?: string
}

type MemoryToolArgs = SaveArgs | SearchArgs | KgAddArgs | DiaryWriteArgs

const getProjectName = (project: unknown) => {
  return typeof project === "object" && project !== null && "name" in project && typeof project.name === "string"
    ? project.name
    : undefined
}

const getProjectWing = (projectName: string | undefined, prefix: string) => {
  return getProjectScope(projectName, prefix).wing
}

const getUserWing = (prefix: string) => {
  return getUserScope(prefix).wing
}

const normalizeValue = (value: string | undefined, redact: boolean) => {
  if (value == null) return value
  const sanitized = sanitizeText(value)
  return redact ? redactSecrets(sanitized) : sanitized
}

export const mempalaceMemoryTool = (ctx: ToolContext) =>
  tool({
    description: "Save or search memory in MemPalace with scope/privacy enforcement",
    args: {
      mode: tool.schema.enum([...TOOL_MEMORY_MODES]),
      scope: tool.schema.enum([...MEMORY_SCOPES]).optional().default("project"),
      room: tool.schema.string().optional().default(DEFAULT_ROOM),
      content: tool.schema.string().optional(),
      query: tool.schema.string().optional(),
      subject: tool.schema.string().optional(),
      predicate: tool.schema.string().optional(),
      object: tool.schema.string().optional(),
      topic: tool.schema.string().optional().default(DEFAULT_TOPIC),
      agent_name: tool.schema.string().optional().default(DEFAULT_AGENT_NAME),
      limit: tool.schema.number().optional().default(DEFAULT_LIMIT),
    },
    async execute(args: MemoryToolArgs) {
      const config = await loadConfig()
      const scope = args.scope ?? "project"
      const wing =
        scope === "user"
          ? getUserWing(config.userWingPrefix)
          : getProjectWing(getProjectName(ctx.project), config.projectWingPrefix)

      if (args.mode === "save") {
        if (!args.content) return JSON.stringify({ success: false, error: ERROR_MESSAGES.contentRequired })
        if (isFullyPrivate(args.content)) {
          return JSON.stringify({ success: false, error: ERROR_MESSAGES.fullyPrivate })
        }
        const content = normalizeValue(args.content, config.privacyRedactionEnabled) ?? ""
        const result = await executeAdapter(ctx.$, {
          mode: "save",
          wing,
          room: normalizeValue(args.room, false),
          content,
          added_by: DEFAULT_AGENT_NAME,
        })
        return JSON.stringify(result)
      }

      if (args.mode === "search") {
        if (!args.query) return JSON.stringify({ success: false, error: ERROR_MESSAGES.queryRequired })
        const query = normalizeValue(args.query, config.privacyRedactionEnabled) ?? ""
        const result = await executeAdapter(ctx.$, {
          mode: "search",
          query,
          wing,
          room: normalizeValue(args.room, false),
          limit: args.limit,
        })
        return JSON.stringify(result)
      }

      if (args.mode === "kg_add") {
        if (!args.subject || !args.predicate || !args.object) {
          return JSON.stringify({ success: false, error: ERROR_MESSAGES.fieldsRequired })
        }
        const subject = normalizeValue(args.subject, config.privacyRedactionEnabled) ?? ""
        const predicate = normalizeValue(args.predicate, false) ?? ""
        const object = normalizeValue(args.object, config.privacyRedactionEnabled) ?? ""
        const result = await executeAdapter(ctx.$, {
          mode: "kg_add",
          subject,
          predicate,
          object,
          valid_from: new Date().toISOString().slice(0, DATE_ISO_SLICE),
          source_closet: "",
        })
        return JSON.stringify(result)
      }

      const result = await executeAdapter(ctx.$, {
        mode: "diary_write",
        agent_name: normalizeValue(args.agent_name, false) ?? DEFAULT_AGENT_NAME,
        entry: normalizeValue(args.content || "", config.privacyRedactionEnabled) ?? "",
        topic: normalizeValue(args.topic, false) ?? DEFAULT_TOPIC,
      })
      return JSON.stringify(result)
    },
  })
