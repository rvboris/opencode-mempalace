import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { DEFAULT_ADAPTER_TIMEOUT_MS, ENV_KEYS, TOOL_ERROR_MESSAGES } from "./constants"
import type { AdapterRequest, AdapterResponse } from "./types"

const getAdapterPath = () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "..", "..", "bridge", "mempalace_adapter.py")
}

const getPythonCommand = () => process.env[ENV_KEYS.adapterPython] || "python"

const getAdapterTimeoutMs = () => {
  const raw = process.env[ENV_KEYS.adapterTimeoutMs]
  if (!raw) return DEFAULT_ADAPTER_TIMEOUT_MS
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ADAPTER_TIMEOUT_MS
}

const isAdapterResponse = (value: unknown): value is AdapterResponse => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const executeAdapter = async (
  _shell: unknown,
  payload: AdapterRequest,
  retries = 3,
): Promise<AdapterResponse> => {
  let lastError: unknown
  const timeoutMs = getAdapterTimeoutMs()
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const child = spawn(getPythonCommand(), [getAdapterPath()], {
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
            if (code === 0) {
              resolve(Buffer.concat(stdout).toString("utf8"))
              return
            }
            reject(new Error(Buffer.concat(stderr).toString("utf8") || `Adapter exited with code ${code}`))
          })
        })

        child.stdin.write(JSON.stringify(payload), "utf8")
        child.stdin.end()
      })

      const parsed: unknown = JSON.parse(text)
      if (!isAdapterResponse(parsed)) {
        throw new Error(TOOL_ERROR_MESSAGES.invalidAdapterPayload)
      }
      return parsed
    } catch (error) {
      lastError = error
      if (attempt === retries) throw error
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }
  throw lastError
}
