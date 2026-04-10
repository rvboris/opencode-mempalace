import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_ROOM,
  DEFAULT_TOPIC,
  DEFAULT_EXTRACT_MODE,
  DEFAULT_INJECTED_ITEMS,
  DEFAULT_RETRIEVAL_LIMIT,
  SERVICE_NAME,
} from "./constants"

export type MempalaceConfig = Readonly<{
  autosaveEnabled: boolean
  retrievalEnabled: boolean
  keywordSaveEnabled: boolean
  autoMineExtractMode: string
  maxInjectedItems: number
  retrievalQueryLimit: number
  keywordPatterns: readonly string[]
  privacyRedactionEnabled: boolean
  userWingPrefix: string
  projectWingPrefix: string
}>

const DEFAULT_CONFIG: MempalaceConfig = {
  autosaveEnabled: true,
  retrievalEnabled: true,
  keywordSaveEnabled: true,
  autoMineExtractMode: DEFAULT_EXTRACT_MODE,
  maxInjectedItems: DEFAULT_INJECTED_ITEMS,
  retrievalQueryLimit: DEFAULT_RETRIEVAL_LIMIT,
  keywordPatterns: ["remember", "save this", "don't forget", "note that"],
  privacyRedactionEnabled: true,
  userWingPrefix: "wing_user",
  projectWingPrefix: "wing_project",
}

const CONFIG_PATH = path.join(os.homedir(), ".config", "opencode", "mempalace.jsonc")

type ConfigRecord = Partial<Record<keyof MempalaceConfig, unknown>>

const stripJsonComments = (value: string) => {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value == null) return fallback
  return value !== "false"
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const readBoolean = (value: unknown, fallback: boolean) => {
  return typeof value === "boolean" ? value : fallback
}

const readPositiveNumber = (value: unknown, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value)
  return fallback
}

const readString = (value: unknown, fallback: string) => {
  if (typeof value !== "string") return fallback
  const normalized = value.trim()
  return normalized || fallback
}

const readStringArray = (value: unknown, fallback: readonly string[]) => {
  if (!Array.isArray(value)) return [...fallback]
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
  return normalized.length ? normalized : [...fallback]
}

let cachedConfig: MempalaceConfig | undefined

export const loadConfig = async (): Promise<MempalaceConfig> => {
  if (cachedConfig) return cachedConfig

  let fileConfig: ConfigRecord = {}
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8")
    const parsed: unknown = JSON.parse(stripJsonComments(raw))
    if (isRecord(parsed)) {
      fileConfig = parsed
    }
  } catch {
    // optional config file
  }

  cachedConfig = {
    autosaveEnabled: parseBoolean(
      process.env.MEMPALACE_AUTOSAVE_ENABLED,
      readBoolean(fileConfig.autosaveEnabled, DEFAULT_CONFIG.autosaveEnabled),
    ),
    retrievalEnabled: parseBoolean(
      process.env.MEMPALACE_RETRIEVAL_ENABLED,
      readBoolean(fileConfig.retrievalEnabled, DEFAULT_CONFIG.retrievalEnabled),
    ),
    keywordSaveEnabled: parseBoolean(
      process.env.MEMPALACE_KEYWORD_SAVE_ENABLED,
      readBoolean(fileConfig.keywordSaveEnabled, DEFAULT_CONFIG.keywordSaveEnabled),
    ),
    autoMineExtractMode: readString(
      process.env.MEMPALACE_AUTO_MINE_EXTRACT_MODE ?? fileConfig.autoMineExtractMode,
      DEFAULT_CONFIG.autoMineExtractMode,
    ),
    privacyRedactionEnabled: parseBoolean(
      process.env.MEMPALACE_PRIVACY_REDACTION_ENABLED,
      readBoolean(fileConfig.privacyRedactionEnabled, DEFAULT_CONFIG.privacyRedactionEnabled),
    ),
    maxInjectedItems: readPositiveNumber(
      process.env.MEMPALACE_MAX_INJECTED_ITEMS != null
        ? Number(process.env.MEMPALACE_MAX_INJECTED_ITEMS)
        : fileConfig.maxInjectedItems,
      DEFAULT_CONFIG.maxInjectedItems,
    ),
    retrievalQueryLimit: readPositiveNumber(
      process.env.MEMPALACE_RETRIEVAL_QUERY_LIMIT != null
        ? Number(process.env.MEMPALACE_RETRIEVAL_QUERY_LIMIT)
        : fileConfig.retrievalQueryLimit,
      DEFAULT_CONFIG.retrievalQueryLimit,
    ),
    keywordPatterns: readStringArray(fileConfig.keywordPatterns, DEFAULT_CONFIG.keywordPatterns),
    userWingPrefix: readString(
      process.env.MEMPALACE_USER_WING_PREFIX ?? fileConfig.userWingPrefix,
      DEFAULT_CONFIG.userWingPrefix,
    ),
    projectWingPrefix: readString(
      process.env.MEMPALACE_PROJECT_WING_PREFIX ?? fileConfig.projectWingPrefix,
      DEFAULT_CONFIG.projectWingPrefix,
    ),
  }

  return cachedConfig
}

export const resetConfig = () => {
  cachedConfig = undefined
}
