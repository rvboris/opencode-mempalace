import { tool } from "@opencode-ai/plugin"
import { executeAdapter } from "../lib/adapter"
import { loadConfig } from "../lib/config"
import { sanitizeText } from "../lib/derive"
import { isFullyPrivate, redactSecrets } from "../lib/privacy"
import { getProjectScope, getUserScope } from "../lib/scope"

type PluginContext = {
  project: any
  $: any
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

export const mempalaceMemoryTool = (ctx: PluginContext) =>
  tool({
    description: "Save or search memory in MemPalace with scope/privacy enforcement",
    args: {
      mode: tool.schema.enum(["save", "search", "kg_add", "diary_write"]),
      scope: tool.schema.enum(["user", "project"]).optional().default("project"),
      room: tool.schema.string().optional().default("workflow"),
      content: tool.schema.string().optional(),
      query: tool.schema.string().optional(),
      subject: tool.schema.string().optional(),
      predicate: tool.schema.string().optional(),
      object: tool.schema.string().optional(),
      topic: tool.schema.string().optional().default("autosave"),
      agent_name: tool.schema.string().optional().default("opencode"),
      limit: tool.schema.number().optional().default(5),
    },
    async execute(args) {
      const config = await loadConfig()
      const wing =
        args.scope === "user"
          ? getUserWing(config.userWingPrefix)
          : getProjectWing(ctx.project?.name, config.projectWingPrefix)

      if (args.mode === "save") {
        if (!args.content) return JSON.stringify({ success: false, error: "content is required" })
        if (isFullyPrivate(args.content)) {
          return JSON.stringify({ success: false, error: "content is fully private and will not be saved" })
        }
        const content = normalizeValue(args.content, config.privacyRedactionEnabled)
        const result = await executeAdapter(ctx.$, {
          mode: "save",
          wing,
          room: normalizeValue(args.room, false),
          content,
          added_by: "opencode",
        })
        return JSON.stringify(result)
      }

      if (args.mode === "search") {
        if (!args.query) return JSON.stringify({ success: false, error: "query is required" })
        const result = await executeAdapter(ctx.$, {
          mode: "search",
          query: normalizeValue(args.query, config.privacyRedactionEnabled),
          wing,
          room: normalizeValue(args.room, false),
          limit: args.limit,
        })
        return JSON.stringify(result)
      }

      if (args.mode === "kg_add") {
        if (!args.subject || !args.predicate || !args.object) {
          return JSON.stringify({ success: false, error: "subject, predicate, and object are required" })
        }
        const result = await executeAdapter(ctx.$, {
          mode: "kg_add",
          subject: normalizeValue(args.subject, config.privacyRedactionEnabled),
          predicate: normalizeValue(args.predicate, false),
          object: normalizeValue(args.object, config.privacyRedactionEnabled),
          valid_from: new Date().toISOString().slice(0, 10),
          source_closet: "",
        })
        return JSON.stringify(result)
      }

      const result = await executeAdapter(ctx.$, {
        mode: "diary_write",
        agent_name: normalizeValue(args.agent_name, false),
        entry: normalizeValue(args.content || "", config.privacyRedactionEnabled),
        topic: normalizeValue(args.topic, false),
      })
      return JSON.stringify(result)
    },
  })
