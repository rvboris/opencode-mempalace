import { tool } from "@opencode-ai/plugin"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { sanitizeText } from "../lib/derive"
import { DATE_ISO_SLICE, DEFAULT_AGENT_NAME, DEFAULT_LIMIT, DEFAULT_ROOM, DEFAULT_TOPIC, ERROR_MESSAGES, LOG_MESSAGES, TOOL_DESCRIPTIONS } from "../lib/constants"
import { getProjectName } from "../lib/opencode"
import { isFullyPrivate, redactSecrets } from "../lib/privacy"
import { getProjectScope, getUserScope } from "../lib/scope"
import { recordMemoryWrite, recordRetrievalSearch, summarizeSearchResult } from "../lib/status"
import { writeLog } from "../lib/log"
import { MEMORY_SCOPES, TOOL_MEMORY_MODES, type MemoryScope, type ToolContext } from "../lib/types"

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
  source_file?: string
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

type DeleteArgs = {
  mode: "delete"
  scope?: MemoryScope
  drawer_id?: string
}

type DeleteBySourceArgs = {
  mode: "delete_by_source"
  scope?: MemoryScope
  source_file?: string
  dry_run?: boolean
}

type KgQueryArgs = {
  mode: "kg_query"
  scope?: MemoryScope
  entity?: string
  as_of?: string
  direction?: string
}

type DiaryReadArgs = {
  mode: "diary_read"
  scope?: MemoryScope
  agent_name?: string
  last_n?: number
}

type CheckpointArgs = {
  mode: "checkpoint"
  scope?: MemoryScope
  items?: string
  diary?: string
  dedup_threshold?: number
}

type MemoryToolArgs =
  | SaveArgs
  | SearchArgs
  | KgAddArgs
  | DiaryWriteArgs
  | DeleteArgs
  | DeleteBySourceArgs
  | KgQueryArgs
  | DiaryReadArgs
  | CheckpointArgs

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
    description: TOOL_DESCRIPTIONS.mempalaceMemory,
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
      source_file: tool.schema.string().optional(),
      drawer_id: tool.schema.string().optional(),
      entity: tool.schema.string().optional(),
      as_of: tool.schema.string().optional(),
      direction: tool.schema.enum(["outgoing", "incoming", "both"]).optional().default("both"),
      dry_run: tool.schema.boolean().optional().default(true),
      last_n: tool.schema.number().optional().default(10),
      items: tool.schema.string().optional(),
      diary: tool.schema.string().optional(),
      dedup_threshold: tool.schema.number().optional().default(0.9),
    },
    async execute(args: MemoryToolArgs, executionContext: { sessionID?: string }) {
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
        if (result?.success !== false) {
          await recordMemoryWrite({
            sessionId: executionContext.sessionID,
            mode: "save",
            scope,
            room: args.room,
            preview: content,
          })
        }
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
          source_file: args.source_file,
        })
        const summary = summarizeSearchResult(result)
        if (result?.success !== false) {
          await recordRetrievalSearch({
            sessionId: executionContext.sessionID,
            scope,
            room: args.room,
            query,
            result,
          })
          await writeLog("INFO", LOG_MESSAGES.retrievalSearchCompleted, {
            sessionId: executionContext.sessionID,
            scope,
            room: args.room,
            query: query.slice(0, 200),
            resultCount: summary.resultCount ?? 0,
            previews: summary.previews,
          })
        }
        const retrievalNote = summary.resultCount
          ? `Found ${summary.resultCount} relevant ${summary.resultCount === 1 ? "memory" : "memories"}:\n${summary.previews.map((p, i) => `${i + 1}. ${p}`).join("\n")}`
          : "No relevant memories found."
        const enriched = typeof result === "object" && result !== null
          ? { ...result, _retrieval_summary: retrievalNote }
          : result
        return JSON.stringify(enriched)
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
        if (result?.success !== false) {
          await recordMemoryWrite({
            sessionId: executionContext.sessionID,
            mode: "kg_add",
            scope,
            preview: `${subject} ${predicate} ${object}`,
          })
        }
        return JSON.stringify(result)
      }

      if (args.mode === "delete") {
        if (!args.drawer_id) return JSON.stringify({ success: false, error: "drawer_id is required" })
        const result = await executeAdapter(ctx.$, {
          mode: "delete",
          drawer_id: args.drawer_id,
        })
        return JSON.stringify(result)
      }

      if (args.mode === "delete_by_source") {
        if (!args.source_file) return JSON.stringify({ success: false, error: "source_file is required" })
        const result = await executeAdapter(ctx.$, {
          mode: "delete_by_source",
          source_file: args.source_file,
          dry_run: args.dry_run ?? true,
        })
        return JSON.stringify(result)
      }

      if (args.mode === "kg_query") {
        if (!args.entity) return JSON.stringify({ success: false, error: "entity is required" })
        const result = await executeAdapter(ctx.$, {
          mode: "kg_query",
          entity: args.entity,
          as_of: args.as_of,
          direction: args.direction ?? "both",
        })
        return JSON.stringify(result)
      }

      if (args.mode === "diary_read") {
        const result = await executeAdapter(ctx.$, {
          mode: "diary_read",
          agent_name: args.agent_name ?? DEFAULT_AGENT_NAME,
          last_n: args.last_n ?? 10,
          wing: scope === "user" ? getUserWing(config.userWingPrefix) : wing,
        })
        return JSON.stringify(result)
      }

      if (args.mode === "checkpoint") {
        if (!args.items) return JSON.stringify({ success: false, error: "items (JSON array) is required" })
        let parsedItems: Array<{ wing: string; room: string; content: string }>
        let parsedDiary: { agent_name?: string; entry: string; topic?: string; wing?: string } | undefined
        try {
          parsedItems = JSON.parse(args.items)
          if (args.diary) parsedDiary = JSON.parse(args.diary)
        } catch {
          return JSON.stringify({ success: false, error: "items/diary must be valid JSON" })
        }
        const result = await executeAdapter(ctx.$, {
          mode: "checkpoint",
          items: parsedItems,
          diary: parsedDiary,
          dedup_threshold: args.dedup_threshold ?? 0.9,
        })
        if (result?.success !== false) {
          await recordMemoryWrite({
            sessionId: executionContext.sessionID,
            mode: "save",
            scope,
            preview: `checkpoint: ${parsedItems.length} items`,
          })
        }
        return JSON.stringify(result)
      }

      // Default: diary_write (fallthrough for mode === "diary_write")
      const result = await executeAdapter(ctx.$, {
        mode: "diary_write",
        agent_name: normalizeValue(args.agent_name, false) ?? DEFAULT_AGENT_NAME,
        entry: normalizeValue(args.content || "", config.privacyRedactionEnabled) ?? "",
        topic: normalizeValue(args.topic, false) ?? DEFAULT_TOPIC,
      })
      if (result?.success !== false) {
        await recordMemoryWrite({
          sessionId: executionContext.sessionID,
          mode: "diary_write",
          scope,
          preview: normalizeValue(args.content || "", config.privacyRedactionEnabled) ?? "",
        })
      }
      return JSON.stringify(result)
    },
  })
