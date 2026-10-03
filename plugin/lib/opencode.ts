import path from "node:path"
import type { SessionMessageInfo } from "@opencode/client"
import type { MessageLike } from "./types"

export const getProjectName = (project: { canonical: string; directory: string }) =>
  path.basename(project.canonical || project.directory)

export const normalizeTranscript = (messages: readonly SessionMessageInfo[]): MessageLike[] =>
  messages.flatMap((message): MessageLike[] => {
    if (message.type === "user") {
      return [{ role: "user", content: message.text }]
    }
    if (message.type === "assistant") {
      const text = message.content
        .filter((part) => part.type === "text")
        .map((part) => part.type === "text" ? part.text : "")
        .join("")
      return text ? [{ role: "assistant", content: text }] : []
    }
    return []
  })

export const getSessionMessages = (response: readonly SessionMessageInfo[]) => normalizeTranscript(response)

export const loadSessionMessages = async (
  ctx: { session: { context(input: { sessionID: string }): Promise<readonly SessionMessageInfo[]> } },
  sessionId: string,
): Promise<MessageLike[]> => normalizeTranscript(await ctx.session.context({ sessionID: sessionId }))
