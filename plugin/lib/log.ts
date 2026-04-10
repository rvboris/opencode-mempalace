import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { AppLoggerClient } from "./types"

type LogLevel = "INFO" | "WARN" | "ERROR"

type Logger = (level: LogLevel, message: string, details?: Record<string, unknown>) => Promise<void>

let logger: Logger = async () => {}

const getFileLogPath = () => {
  return process.env.MEMPALACE_AUTOSAVE_LOG_FILE || path.join(os.homedir(), ".mempalace", "opencode_autosave.log")
}

const writeFileLog = async (level: LogLevel, message: string, details?: Record<string, unknown>) => {
  try {
    const filePath = getFileLogPath()
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.appendFile(
      filePath,
      `${JSON.stringify({ timestamp: new Date().toISOString(), level, message, details })}\n`,
      "utf8",
    )
  } catch {
    // avoid crashing plugin because of file logging
  }
}

const toAppLevel = (level: LogLevel) => {
  if (level === "WARN") return "warn"
  if (level === "ERROR") return "error"
  return "info"
}

export const setLogger = (client: AppLoggerClient) => {
  logger = async (level, message, details) => {
    await writeFileLog(level, message, details)
    try {
      await client.app?.log?.({
        body: {
          service: "mempalace-autosave",
          level: toAppLevel(level),
          message,
          extra: details,
        },
      })
    } catch {
      // avoid crashing plugin because of logging
    }
  }
}

export const resetLogger = () => {
  logger = async () => {}
}

export const writeLog = async (level: LogLevel, message: string, details?: Record<string, unknown>) => {
  await logger(level, message, details)
}
