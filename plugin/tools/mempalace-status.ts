import { tool } from "@opencode-ai/plugin"
import { TOOL_DESCRIPTIONS } from "../lib/constants"
import { formatStatusSummary, readStatusState } from "../lib/status"

type StatusArgs = {
  verbose?: boolean
  compact?: boolean
}

export const mempalaceStatusTool = () =>
  tool({
    description: TOOL_DESCRIPTIONS.mempalaceStatus,
    args: {
      verbose: tool.schema.boolean().optional().default(false),
      compact: tool.schema.boolean().optional().default(false),
    },
    async execute(args: StatusArgs, executionContext: { sessionID?: string }) {
      const state = await readStatusState()
      const verbose = args.verbose ?? false
      return formatStatusSummary(state, executionContext.sessionID, {
        verbose,
        compact: !verbose,
      })
    },
  })
