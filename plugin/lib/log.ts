import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ENV_KEYS, LOG_FILE_NAME } from "./constants"

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

export const setLogger = () => {
  logger = writeFileLog
}

export const resetLogger = () => {
  logger = async () => {}
}

export const writeLog = async (level: LogLevel, message: string, details?: Record<string, unknown>) => {
  await logger(level, message, details)
}
