export const isDirectMempalaceMutationTool = (tool: string) => {
  return [
    "mempalace_add_drawer",
    "mempalace_kg_add",
    "mempalace_diary_write",
    "mcp-router_mempalace_add_drawer",
    "mcp-router_mempalace_kg_add",
    "mcp-router_mempalace_diary_write",
  ].includes(tool)
}
