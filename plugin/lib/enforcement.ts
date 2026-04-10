import { DIRECT_MEMPALACE_MUTATION_TOOLS } from "./constants"

export const isDirectMempalaceMutationTool = (tool: string) => {
  return DIRECT_MEMPALACE_MUTATION_TOOLS.includes(tool as (typeof DIRECT_MEMPALACE_MUTATION_TOOLS)[number])
}
