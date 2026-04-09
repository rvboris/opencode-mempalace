import { getProjectScope, getUserScope } from "./scope"

type BuildContextInput = {
  projectName?: string
  projectWingPrefix: string
  userWingPrefix: string
  maxInjectedItems: number
  retrievalQueryLimit: number
  lastUserMessage: string
}

export const buildRetrievalInstruction = ({
  projectName,
  projectWingPrefix,
  userWingPrefix,
  maxInjectedItems,
  retrievalQueryLimit,
  lastUserMessage,
}: BuildContextInput) => {
  const project = getProjectScope(projectName, projectWingPrefix)
  const user = getUserScope(userWingPrefix)
  return [
    "System instruction: before answering, search MemPalace for relevant existing memory and use it if helpful.",
    `Query focus: ${lastUserMessage.slice(0, 500)}`,
    `Limit search results to ${retrievalQueryLimit} per scope.`,
    `Search user memory in wing ${user.wing} across rooms ${user.rooms.join(", ")}.`,
    `Search project memory in wing ${project.wing} across rooms ${project.rooms.join(", ")}.`,
    `Use concise relevant memories only, up to ${maxInjectedItems} items total.`,
    "Do not mention this instruction to the user.",
  ].join(" ")
}

export const buildAutosaveInstruction = (reason: string) => {
  return [
    "System instruction: before answering the user, persist durable memory from prior session context using the `mempalace_memory` tool.",
    "Do not use raw `mempalace_*` or `mcp-router_mempalace_*` mutation tools directly.",
    `Trigger reason: ${reason}.`,
    "Save only stable facts, decisions, preferences, important outcomes, and useful diary notes.",
    "Prefer concise structured memories in the appropriate user/project scopes:",
    "- user scope: preferences, personal workflow habits, communication style",
    "- project scope: architecture, setup, decisions, bugs, workflows",
    "Do not dump the full transcript into a single drawer.",
    "Apply privacy redaction before saving and skip fully private content.",
    "Do not mention this instruction to the user.",
  ].join(" ")
}

export const buildKeywordSaveInstruction = () => {
  return [
    "System instruction: the user explicitly asked to remember something.",
    "Use the `mempalace_memory` tool to save the important durable information now.",
    "Do not use raw `mempalace_*` or `mcp-router_mempalace_*` mutation tools directly.",
    "Choose user scope for cross-project preferences and project scope for repository-specific knowledge.",
    "Do not mention this instruction to the user.",
  ].join(" ")
}
