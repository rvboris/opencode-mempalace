import type { Tool } from "@opencode/schema/tool"
import { TOOL_DESCRIPTIONS } from "../lib/constants"
import { formatStatusSummary, readStatusState } from "../lib/status"

export const mempalaceStatusTool = () => ({
  name: "mempalace_status",
  description: TOOL_DESCRIPTIONS.mempalaceStatus,
  input: {
    type: "object",
    properties: {
      verbose: { type: "boolean", default: true },
      compact: { type: "boolean", default: false },
    },
    additionalProperties: false,
  },
  async execute(input: unknown, executionContext: { sessionID?: string }): Promise<Tool.Result> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      return { content: JSON.stringify({ success: false, error: "Invalid status arguments" }) }
    }
    const args = input as Record<string, unknown>
    if ((args.verbose !== undefined && typeof args.verbose !== "boolean") || (args.compact !== undefined && typeof args.compact !== "boolean")) {
      return { content: JSON.stringify({ success: false, error: "verbose and compact must be booleans" }) }
    }
    const verbose = args.verbose ?? true
    const compact = args.compact ?? !verbose
    const state = await readStatusState()
    return { content: formatStatusSummary(state, executionContext.sessionID, { verbose, compact }) }
  },
})
