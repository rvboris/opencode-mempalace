import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ENV_KEYS, LOG_FILE_NAME, SERVICE_NAME } from "./constants"
import type { AppLoggerClient } from "./types"

type LogLevel = "INFO" | "WARN" | "ERROR"

type Logger = (level: LogLevel, message: string, details?: Record<string, unknown>) => Promise<void>

let logger: Logger = async () => {}

const getFileLogPath = () => {
  return process.env[ENV_KEYS.autosaveLogFile] || path.join(os.homedir(), ".mempalace", LOG_FILE_NAME)
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
          service: SERVICE_NAME,
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
