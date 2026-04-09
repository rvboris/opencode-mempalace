import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

export type MempalaceConfig = {
  autosaveEnabled: boolean
  retrievalEnabled: boolean
  keywordSaveEnabled: boolean
  maxInjectedItems: number
  retrievalQueryLimit: number
  keywordPatterns: string[]
  privacyRedactionEnabled: boolean
  userWingPrefix: string
  projectWingPrefix: string
}

const DEFAULT_CONFIG: MempalaceConfig = {
  autosaveEnabled: true,
  retrievalEnabled: true,
  keywordSaveEnabled: true,
  maxInjectedItems: 6,
  retrievalQueryLimit: 5,
  keywordPatterns: ["remember", "save this", "don't forget", "note that"],
  privacyRedactionEnabled: true,
  userWingPrefix: "wing_user",
  projectWingPrefix: "wing_project",
}

const CONFIG_PATH = path.join(os.homedir(), ".config", "opencode", "mempalace.jsonc")

const stripJsonComments = (value: string) => {
  return value.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value == null) return fallback
  return value !== "false"
}

let cachedConfig: MempalaceConfig | undefined

export const loadConfig = async (): Promise<MempalaceConfig> => {
  if (cachedConfig) return cachedConfig

  let fileConfig: Partial<MempalaceConfig> = {}
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8")
    fileConfig = JSON.parse(stripJsonComments(raw))
  } catch {
    // optional config file
  }

  cachedConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    autosaveEnabled: parseBoolean(process.env.MEMPALACE_AUTOSAVE_ENABLED, fileConfig.autosaveEnabled ?? DEFAULT_CONFIG.autosaveEnabled),
    retrievalEnabled: parseBoolean(process.env.MEMPALACE_RETRIEVAL_ENABLED, fileConfig.retrievalEnabled ?? DEFAULT_CONFIG.retrievalEnabled),
    keywordSaveEnabled: parseBoolean(process.env.MEMPALACE_KEYWORD_SAVE_ENABLED, fileConfig.keywordSaveEnabled ?? DEFAULT_CONFIG.keywordSaveEnabled),
    privacyRedactionEnabled: parseBoolean(process.env.MEMPALACE_PRIVACY_REDACTION_ENABLED, fileConfig.privacyRedactionEnabled ?? DEFAULT_CONFIG.privacyRedactionEnabled),
    maxInjectedItems: Number(process.env.MEMPALACE_MAX_INJECTED_ITEMS || fileConfig.maxInjectedItems || DEFAULT_CONFIG.maxInjectedItems),
    retrievalQueryLimit: Number(
      process.env.MEMPALACE_RETRIEVAL_QUERY_LIMIT || fileConfig.retrievalQueryLimit || DEFAULT_CONFIG.retrievalQueryLimit,
    ),
    keywordPatterns: fileConfig.keywordPatterns || DEFAULT_CONFIG.keywordPatterns,
    userWingPrefix: process.env.MEMPALACE_USER_WING_PREFIX || fileConfig.userWingPrefix || DEFAULT_CONFIG.userWingPrefix,
    projectWingPrefix: process.env.MEMPALACE_PROJECT_WING_PREFIX || fileConfig.projectWingPrefix || DEFAULT_CONFIG.projectWingPrefix,
  }

  return cachedConfig
}

export const resetConfig = () => {
  cachedConfig = undefined
}
