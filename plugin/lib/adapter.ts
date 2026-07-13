import { spawn as nodeSpawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path, { delimiter } from "node:path"
import { fileURLToPath } from "node:url"
import { DEFAULT_ADAPTER_TIMEOUT_MS, ENV_KEYS, TOOL_ERROR_MESSAGES } from "./constants"
import type { AdapterRequest, AdapterResponse } from "./types"

const getAdapterPath = () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "..", "..", "bridge", "mempalace_adapter.py")
}

const PYTHON_BINARIES =
  process.platform === "win32" ? ["python.exe", "python3.exe", "python"] : ["python3", "python"]
const MEMPALACE_BINARIES = process.platform === "win32" ? ["mempalace.exe"] : ["mempalace"]

/** Find an executable by name somewhere on $PATH without spawning a shell. */
const findOnPath = (name: string): string | null => {
  const dirs = (process.env.PATH ?? "").split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    try {
      const candidate = path.join(dir, name)
      if (existsSync(candidate)) return candidate
    } catch {
      // unreadable / permission issues — keep scanning
    }
  }
  return null
}

/** Extract the interpreter path from a script's shebang line, if absolute. */
const readShebang = (file: string): string | null => {
  try {
    const firstLine = readFileSync(file, { encoding: "utf8", flag: "r" }).split("\n", 1)[0]
    if (!firstLine.startsWith("#!")) return null
    const parts = firstLine.slice(2).trim().split(/\s+/)
    // Skip `#!/usr/bin/env python` — can't resolve to an absolute path here;
    // the $PATH fallback below handles it.
    if (parts[0] === "env" || parts[0].endsWith("/env")) return null
    return parts[0] || null
  } catch {
    return null
  }
}

let resolvedPython: string | null | undefined

/**
 * Resolve the Python interpreter that owns the `mempalace` package.
 *
 * Resolution order:
 *   1. `MEMPALACE_ADAPTER_PYTHON` env (explicit override).
 *   2. The shebang of the `mempalace` CLI on $PATH — a console_script always
 *      points at the interpreter that installed the package (pipx, uv-tool,
 *      pip --user, or a venv), so this is the most reliable auto-detection.
 *   3. `python3` then `python` on $PATH (best-effort; may still lack mempalace).
 *
 * Returns null if nothing usable was found.
 */
export const resolvePython = (): string | null => {
  if (resolvedPython !== undefined) return resolvedPython

  const envPy = process.env[ENV_KEYS.adapterPython]
  if (envPy?.trim()) {
    resolvedPython = envPy
    return envPy
  }

  for (const name of MEMPALACE_BINARIES) {
    const bin = findOnPath(name)
    if (!bin) continue
    const shebangPy = readShebang(bin)
    if (shebangPy && existsSync(shebangPy)) {
      resolvedPython = shebangPy
      return shebangPy
    }
  }

  for (const name of PYTHON_BINARIES) {
    if (findOnPath(name)) {
      resolvedPython = name
      return name
    }
  }

  resolvedPython = null
  return null
}

/** Test-only: clear the cached interpreter so env/PATH changes are re-read. */
export const resetPythonResolver = (): void => {
  resolvedPython = undefined
}

const getPythonCommand = () => resolvePython() ?? "python"

const getAdapterTimeoutMs = () => {
  const raw = process.env[ENV_KEYS.adapterTimeoutMs]
  if (!raw) return DEFAULT_ADAPTER_TIMEOUT_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ADAPTER_TIMEOUT_MS
}

const isAdapterResponse = (value: unknown): value is AdapterResponse => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const getStderrSnippet = (value: string) => {
  const normalized = value.trim()
  if (!normalized) return ""
  return normalized.length > 240 ? `${normalized.slice(0, 240)}...` : normalized
}

const WRITE_LIKE_MODES = new Set<AdapterRequest["mode"]>([
  "save",
  "mine_messages",
  "diary_write",
  "kg_add",
  "checkpoint",
  "delete",
  "delete_by_source",
])

const LOCK_HELD_PATTERN = /(?:palace\s+.*\s+is\s+held\s+by\s+PID|held\s+by\s+PID)/i
let writeLikeQueue: Promise<unknown> = Promise.resolve()

let spawnCommand = nodeSpawn
let adapterDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export const setAdapterDelayForTests = (delay: typeof adapterDelay): void => {
  adapterDelay = delay
}

export const setAdapterSpawnForTests = (spawn: typeof nodeSpawn): void => {
  spawnCommand = spawn
}

export const resetAdapterTestHooks = (): void => {
  spawnCommand = nodeSpawn
  adapterDelay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
  writeLikeQueue = Promise.resolve()
}

const isWriteLikeMode = (payload: AdapterRequest) => WRITE_LIKE_MODES.has(payload.mode)

const isLockHeldError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return LOCK_HELD_PATTERN.test(message)
}

const executeAdapterProcess = async (payload: AdapterRequest): Promise<AdapterResponse> => {
  const timeoutMs = getAdapterTimeoutMs()
  const { stderrText, stdoutText } = await new Promise<{ stderrText: string; stdoutText: string }>((resolve, reject) => {
      const child = spawnCommand(getPythonCommand(), [getAdapterPath()], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    let settled = false

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    const timeoutId = setTimeout(() => {
      child.kill()
      if (settled) return
      settled = true
      reject(new Error(`${TOOL_ERROR_MESSAGES.adapterTimedOut} after ${timeoutMs}ms`))
    }, timeoutMs)

    const finish = (handler: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      handler()
    }

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)))
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)))
    child.on("error", (error) => finish(() => reject(error)))
    child.on("close", (code) => {
      finish(() => {
        const stderrText = Buffer.concat(stderr).toString("utf8")
        const stdoutText = Buffer.concat(stdout).toString("utf8")
        if (code === 0) {
          resolve({ stderrText, stdoutText })
          return
        }
        reject(new Error(stderrText || `Adapter exited with code ${code}`))
      })
    })

    child.stdin.write(JSON.stringify(payload), "utf8")
    child.stdin.end()
  })

  if (!stdoutText.trim()) {
    const stderrSnippet = getStderrSnippet(stderrText)
    throw new Error(
      stderrSnippet
        ? `${TOOL_ERROR_MESSAGES.emptyAdapterStdout}: ${stderrSnippet}`
        : TOOL_ERROR_MESSAGES.emptyAdapterStdout,
    )
  }

  const parsed: unknown = JSON.parse(stdoutText)
  if (!isAdapterResponse(parsed)) {
    throw new Error(TOOL_ERROR_MESSAGES.invalidAdapterPayload)
  }
  return parsed
}

const executeAdapterWithRetry = async (payload: AdapterRequest, retries: number): Promise<AdapterResponse> => {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await executeAdapterProcess(payload)
    } catch (error) {
      lastError = error
      if (attempt === retries || !isLockHeldError(error)) throw error
      await adapterDelay(50 * (attempt + 1))
    }
  }
  throw lastError
}

const enqueueWriteLike = <T>(operation: () => Promise<T>): Promise<T> => {
  const run = writeLikeQueue.then(operation, operation)
  writeLikeQueue = run.catch(() => undefined)
  return run
}

export const executeAdapter = async (
  _shell: unknown,
  payload: AdapterRequest,
  retries = 3,
): Promise<AdapterResponse> => {
  // Fail fast with an actionable message if no usable interpreter was found.
  if (resolvePython() === null) {
    throw new Error(TOOL_ERROR_MESSAGES.pythonNotFound)
  }

  const operation = () => executeAdapterWithRetry(payload, retries)
  return isWriteLikeMode(payload) ? enqueueWriteLike(operation) : operation()
}
