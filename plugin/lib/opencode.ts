import type { PluginInput } from "@opencode-ai/plugin"
import type { MessageLike, SessionMessagesResponse } from "./types"

export const getProjectName = (project: unknown) => {
  return typeof project === "object" && project !== null && "name" in project && typeof project.name === "string"
    ? project.name
    : undefined
}

export const getSessionMessages = (response: SessionMessagesResponse): readonly MessageLike[] => {
  if (Array.isArray(response)) return response
  if (response && typeof response === "object" && "data" in response && Array.isArray(response.data)) return response.data
  return []
}

export const loadSessionMessages = async (
  client: PluginInput["client"],
  sessionId: string,
): Promise<readonly MessageLike[]> => {
  const response = await client.session.messages({ path: { id: sessionId } })
  return getSessionMessages(response)
}
