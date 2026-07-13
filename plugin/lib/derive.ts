import { JUDGE_TAG_PATTERN } from "./constants"

const ANSI_PATTERN = /\u001B(?:\][^\u0007]*(?:\u0007|\u001B\\)|\[[0-?]*[ -/]*[@-~]|[@-Z\\-_])/g
const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g

const JUDGE_TAG_STRIP_PATTERN = /\n*\[?\s*memory\s*:\s*(?:none|cited|improved|saved-time)\s*\]?\s*$/i

const stripInvalidSurrogates = (text: string) => {
  let result = ""
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        result += text[i] + text[i + 1]
        i += 1
      } else {
        result += "�"
      }
      continue
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      result += "�"
      continue
    }
    result += text[i]
  }
  return result
}

export const sanitizeText = (text: string) => {
  if (!text) return text
  return stripInvalidSurrogates(text)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(ANSI_PATTERN, "")
    .replace(ZERO_WIDTH_PATTERN, "")
    .replace(CONTROL_PATTERN, "")
}

export const stripJudgeTag = (text: string) => {
  if (!text) return text
  return text.replace(JUDGE_TAG_STRIP_PATTERN, "").trimEnd()
}

export const parseJudgeTag = (text: string): string | null => {
  if (!text) return null
  // Find all matches, return the last verdict (transcript may contain tags from prior turns)
  const global = new RegExp(JUDGE_TAG_PATTERN.source, "gi")
  let last: string | null = null
  for (;;) {
    const m = global.exec(text)
    if (m === null) break
    last = m[1].toLowerCase()
  }
  return last
}
