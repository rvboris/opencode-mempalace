import type { Tool } from "@opencode/schema/tool"
import type { Context as V2PluginContext } from "@opencode/plugin/promise/plugin"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { sanitizeText } from "../lib/derive"
import { DATE_ISO_SLICE, DEFAULT_AGENT_NAME, DEFAULT_LIMIT, DEFAULT_ROOM, DEFAULT_TOPIC, ERROR_MESSAGES, LOG_MESSAGES, TOOL_DESCRIPTIONS } from "../lib/constants"
import { getProjectName } from "../lib/opencode"
import { isFullyPrivate, redactSecrets } from "../lib/privacy"
import { getProjectScope, getUserScope } from "../lib/scope"
import { recordMemoryWrite, recordRetrievalSearch, summarizeSearchResult } from "../lib/status"
import { writeLog } from "../lib/log"
import { MEMORY_SCOPES, TOOL_MEMORY_MODES, type MemoryScope } from "../lib/types"

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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value)
const parseMemoryArgs = (input: unknown): MemoryToolArgs | undefined => {
  if (!isRecord(input) || typeof input.mode !== "string" || !(TOOL_MEMORY_MODES as readonly string[]).includes(input.mode)) return
  if (input.scope !== undefined && !(MEMORY_SCOPES as readonly string[]).includes(String(input.scope))) return
  const strings = ["room", "content", "query", "subject", "predicate", "object", "topic", "agent_name", "source_file", "drawer_id", "entity", "as_of", "items", "diary"]
  if (strings.some((key) => input[key] !== undefined && typeof input[key] !== "string")) return
  if (["limit", "last_n", "dedup_threshold"].some((key) => input[key] !== undefined && (typeof input[key] !== "number" || !Number.isFinite(input[key])))) return
  if (input.dry_run !== undefined && typeof input.dry_run !== "boolean") return
  if (input.direction !== undefined && !["outgoing", "incoming", "both"].includes(String(input.direction))) return
  return input as MemoryToolArgs
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

const executeToolAdapter = async (shell: unknown, payload: Parameters<typeof executeAdapter>[1]) => {
  try {
    return await executeAdapter(shell, payload)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

type MemoryToolContext = Pick<V2PluginContext, "location">

export const mempalaceMemoryTool = (ctx: MemoryToolContext) => ({
    name: "mempalace_memory",
    description: TOOL_DESCRIPTIONS.mempalaceMemory,
    input: {
      type: "object",
      properties: {
      mode: { type: "string", enum: [...TOOL_MEMORY_MODES] },
      scope: { type: "string", enum: [...MEMORY_SCOPES] },
      room: { type: "string", default: DEFAULT_ROOM },
      content: { type: "string" },
      query: { type: "string" },
      subject: { type: "string" },
      predicate: { type: "string" },
      object: { type: "string" },
      topic: { type: "string", default: DEFAULT_TOPIC },
      agent_name: { type: "string", default: DEFAULT_AGENT_NAME },
      limit: { type: "number", default: DEFAULT_LIMIT },
      source_file: { type: "string" },
      drawer_id: { type: "string" },
      entity: { type: "string" },
      as_of: { type: "string" },
      direction: { type: "string", enum: ["outgoing", "incoming", "both"], default: "both" },
      dry_run: { type: "boolean", default: true },
      last_n: { type: "number", default: 10 },
      items: { type: "string" },
      diary: { type: "string" },
      dedup_threshold: { type: "number", default: 0.9 },
      },
      required: ["mode"],
      additionalProperties: false,
    },
    async execute(input: unknown, executionContext: { sessionID?: string }): Promise<Tool.Result> {
      const args = parseMemoryArgs(input)
      if (!args) return { content: JSON.stringify({ success: false, error: "Invalid tool arguments" }) }
      const config = await loadConfig()
      const scope = args.scope ?? "project"
      const wing =
        scope === "user"
          ? getUserWing(config.userWingPrefix)
          : getProjectWing(getProjectName(ctx.location.project), config.projectWingPrefix)

      if (args.mode === "save") {
        const room = normalizeValue(args.room ?? DEFAULT_ROOM, false) ?? DEFAULT_ROOM
        if (!args.content) return { content: JSON.stringify({ success: false, error: ERROR_MESSAGES.contentRequired }) }
        if (isFullyPrivate(args.content)) {
          return { content: JSON.stringify({ success: false, error: ERROR_MESSAGES.fullyPrivate }) }
        }
        const content = normalizeValue(args.content, config.privacyRedactionEnabled) ?? ""
        const result = await executeToolAdapter(undefined, {
          mode: "save",
          wing,
          room,
          content,
          added_by: DEFAULT_AGENT_NAME,
        })
        const saveResult = result?.success === false
          ? result
          : { ...result, success: true, wing, room, scope, already_exists: result?.already_exists === true }
        if (saveResult.success !== false) {
          await recordMemoryWrite({
            sessionId: executionContext.sessionID,
            mode: "save",
            scope,
            room,
            preview: content,
          })
        }
        return { content: JSON.stringify(saveResult) }
      }

      if (args.mode === "search") {
        const room = normalizeValue(args.room ?? DEFAULT_ROOM, false) ?? DEFAULT_ROOM
        if (!args.query) return { content: JSON.stringify({ success: false, error: ERROR_MESSAGES.queryRequired }) }
        const query = normalizeValue(args.query, config.privacyRedactionEnabled) ?? ""
        const result = await executeToolAdapter(undefined, {
          mode: "search",
          query,
          wing,
          room,
          limit: args.limit,
          source_file: args.source_file,
        })
        const summary = summarizeSearchResult(result)
        if (result?.success !== false) {
          await recordRetrievalSearch({
            sessionId: executionContext.sessionID,
            scope,
            room,
            query,
            result,
          })
          await writeLog("INFO", LOG_MESSAGES.retrievalSearchCompleted, {
            sessionId: executionContext.sessionID,
            scope,
            room,
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
        return { content: JSON.stringify(enriched) }
      }

      if (args.mode === "kg_add") {
        if (!args.subject || !args.predicate || !args.object) {
          return { content: JSON.stringify({ success: false, error: ERROR_MESSAGES.fieldsRequired }) }
        }
        const subject = normalizeValue(args.subject, config.privacyRedactionEnabled) ?? ""
        const predicate = normalizeValue(args.predicate, false) ?? ""
        const object = normalizeValue(args.object, config.privacyRedactionEnabled) ?? ""
        const result = await executeToolAdapter(undefined, {
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
        return { content: JSON.stringify(result) }
      }

      if (args.mode === "delete") {
        if (!args.drawer_id) return { content: JSON.stringify({ success: false, error: "drawer_id is required" }) }
        const result = await executeToolAdapter(undefined, {
          mode: "delete",
          drawer_id: args.drawer_id,
        })
        return { content: JSON.stringify(result) }
      }

      if (args.mode === "delete_by_source") {
        if (!args.source_file) return { content: JSON.stringify({ success: false, error: "source_file is required" }) }
        const result = await executeToolAdapter(undefined, {
          mode: "delete_by_source",
          source_file: args.source_file,
          dry_run: args.dry_run ?? true,
        })
        return { content: JSON.stringify(result) }
      }

      if (args.mode === "kg_query") {
        if (!args.entity) return { content: JSON.stringify({ success: false, error: "entity is required" }) }
        const result = await executeToolAdapter(undefined, {
          mode: "kg_query",
          entity: args.entity,
          as_of: args.as_of,
          direction: args.direction ?? "both",
        })
        return { content: JSON.stringify(result) }
      }

      if (args.mode === "diary_read") {
        const result = await executeToolAdapter(undefined, {
          mode: "diary_read",
          agent_name: args.agent_name ?? DEFAULT_AGENT_NAME,
          last_n: args.last_n ?? 10,
          wing: scope === "user" ? getUserWing(config.userWingPrefix) : wing,
        })
        return { content: JSON.stringify(result) }
      }

      if (args.mode === "checkpoint") {
        if (!args.items) return { content: JSON.stringify({ success: false, error: "items (JSON array) is required" }) }
        let parsedItems: Array<{ wing: string; room: string; content: string }>
        let parsedDiary: { agent_name?: string; entry: string; topic?: string; wing?: string } | undefined
        try {
          const itemsValue: unknown = JSON.parse(args.items)
          const diaryValue: unknown = args.diary ? JSON.parse(args.diary) : undefined
          if (!Array.isArray(itemsValue) || !itemsValue.every((item) => isRecord(item) && typeof item.wing === "string" && typeof item.room === "string" && typeof item.content === "string")) {
            return { content: JSON.stringify({ success: false, error: "items must be an array of { wing, room, content } strings" }) }
          }
          if (diaryValue !== undefined && (!isRecord(diaryValue) || typeof diaryValue.entry !== "string" || ["agent_name", "topic", "wing"].some((key) => diaryValue[key] !== undefined && typeof diaryValue[key] !== "string"))) {
            return { content: JSON.stringify({ success: false, error: "diary must contain an entry string and optional string metadata" }) }
          }
          parsedItems = itemsValue.map((item) => ({ ...item, content: normalizeValue(item.content, config.privacyRedactionEnabled) ?? "" }))
          parsedDiary = diaryValue ? { ...diaryValue, entry: normalizeValue(String(diaryValue.entry), config.privacyRedactionEnabled) ?? "" } : undefined
        } catch {
          return { content: JSON.stringify({ success: false, error: "items/diary must be valid JSON" }) }
        }
        const result = await executeToolAdapter(undefined, {
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
        return { content: JSON.stringify(result) }
      }

      // Default: diary_write (fallthrough for mode === "diary_write")
      const result = await executeToolAdapter(undefined, {
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
      return { content: JSON.stringify(result) }
    },
  })
