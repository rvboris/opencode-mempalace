import { sanitizeText } from "./derive"

const PRIVATE_BLOCK_PATTERN = /<private>[\s\S]*?<\/private>/gi
const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/gi,
  /ghp_[A-Za-z0-9]{20,}/gi,
  /xox[baprs]-[A-Za-z0-9-]{10,}/gi,
  /AKIA[0-9A-Z]{16}/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/g,
  /password\s*[:=]\s*\S+/gi,
  /token\s*[:=]\s*\S+/gi,
]

export const stripPrivateContent = (text: string) => sanitizeText(text.replace(PRIVATE_BLOCK_PATTERN, "[REDACTED_PRIVATE]"))

export const isFullyPrivate = (text: string) => {
  const stripped = text.replace(PRIVATE_BLOCK_PATTERN, "").trim()
  return stripped.length === 0
}

export const redactSecrets = (text: string) => {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, "[REDACTED_SECRET]"), stripPrivateContent(text))
}
