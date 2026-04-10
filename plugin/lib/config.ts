import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  DEFAULT_EXTRACT_MODE,
  DEFAULT_INJECTED_ITEMS,
  DEFAULT_RETRIEVAL_LIMIT,
  DEFAULT_KEYWORD_PATTERNS,
  DEFAULT_PROJECT_WING_PREFIX,
  DEFAULT_USER_WING_PREFIX,
  CONFIG_PATH_SEGMENTS,
  ENV_KEYS,
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
    keywordPatterns: DEFAULT_KEYWORD_PATTERNS,
    privacyRedactionEnabled: true,
    userWingPrefix: DEFAULT_USER_WING_PREFIX,
    projectWingPrefix: DEFAULT_PROJECT_WING_PREFIX,
}

const CONFIG_PATH = path.join(os.homedir(), ...CONFIG_PATH_SEGMENTS)

type ConfigRecord = Partial<Record<keyof MempalaceConfig, unknown>>

const stripJsonComments = (value: string) => {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value == null) return fallback
  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off", ""].includes(normalized)) return false
  return fallback
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
      process.env[ENV_KEYS.autosaveEnabled],
      readBoolean(fileConfig.autosaveEnabled, DEFAULT_CONFIG.autosaveEnabled),
    ),
    retrievalEnabled: parseBoolean(
      process.env[ENV_KEYS.retrievalEnabled],
      readBoolean(fileConfig.retrievalEnabled, DEFAULT_CONFIG.retrievalEnabled),
    ),
    keywordSaveEnabled: parseBoolean(
      process.env[ENV_KEYS.keywordSaveEnabled],
      readBoolean(fileConfig.keywordSaveEnabled, DEFAULT_CONFIG.keywordSaveEnabled),
    ),
    autoMineExtractMode: readString(
      process.env[ENV_KEYS.extractMode] ?? fileConfig.autoMineExtractMode,
      DEFAULT_CONFIG.autoMineExtractMode,
    ),
    privacyRedactionEnabled: parseBoolean(
      process.env[ENV_KEYS.privacyRedactionEnabled],
      readBoolean(fileConfig.privacyRedactionEnabled, DEFAULT_CONFIG.privacyRedactionEnabled),
    ),
    maxInjectedItems: readPositiveNumber(
      process.env[ENV_KEYS.maxInjectedItems] != null
        ? Number(process.env[ENV_KEYS.maxInjectedItems])
        : fileConfig.maxInjectedItems,
      DEFAULT_CONFIG.maxInjectedItems,
    ),
    retrievalQueryLimit: readPositiveNumber(
      process.env[ENV_KEYS.retrievalQueryLimit] != null
        ? Number(process.env[ENV_KEYS.retrievalQueryLimit])
        : fileConfig.retrievalQueryLimit,
      DEFAULT_CONFIG.retrievalQueryLimit,
    ),
    keywordPatterns: readStringArray(fileConfig.keywordPatterns, DEFAULT_CONFIG.keywordPatterns),
    userWingPrefix: readString(
      process.env[ENV_KEYS.userWingPrefix] ?? fileConfig.userWingPrefix,
      DEFAULT_CONFIG.userWingPrefix,
    ),
    projectWingPrefix: readString(
      process.env[ENV_KEYS.projectWingPrefix] ?? fileConfig.projectWingPrefix,
      DEFAULT_CONFIG.projectWingPrefix,
    ),
  }

  return cachedConfig
}

export const resetConfig = () => {
  cachedConfig = undefined
}
