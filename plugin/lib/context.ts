import { getProjectScope, getUserScope } from "./scope"
import { INSTRUCTION_TEXT } from "./constants"

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
    INSTRUCTION_TEXT.retrievalIntro,
    `Query focus: ${lastUserMessage.slice(0, 500)}`,
    `Limit search results to ${retrievalQueryLimit} per scope.`,
    `Search user memory in wing ${user.wing} across rooms ${user.rooms.join(", ")}.`,
    `Search project memory in wing ${project.wing} across rooms ${project.rooms.join(", ")}.`,
    `Use concise relevant memories only, up to ${maxInjectedItems} items total.`,
    INSTRUCTION_TEXT.doNotMentionToUser,
  ].join(" ")
}

export const buildAutosaveInstruction = (reason: string) => {
  return [
    INSTRUCTION_TEXT.autosaveIntro,
    INSTRUCTION_TEXT.avoidRawMutationTools,
    `Trigger reason: ${reason}.`,
    INSTRUCTION_TEXT.saveStableFacts,
    INSTRUCTION_TEXT.preferConciseStructuredMemories,
    INSTRUCTION_TEXT.userScopeHint,
    INSTRUCTION_TEXT.projectScopeHint,
    INSTRUCTION_TEXT.avoidFullTranscript,
    INSTRUCTION_TEXT.applyPrivacyRedaction,
    INSTRUCTION_TEXT.doNotMentionToUser,
  ].join(" ")
}

export const buildKeywordSaveInstruction = () => {
  return [
    INSTRUCTION_TEXT.keywordIntro,
    INSTRUCTION_TEXT.useMemoryToolNow,
    INSTRUCTION_TEXT.avoidRawMutationTools,
    INSTRUCTION_TEXT.chooseScope,
    INSTRUCTION_TEXT.doNotMentionToUser,
  ].join(" ")
}
