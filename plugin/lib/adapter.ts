import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const getAdapterPath = () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, "..", "..", "bridge", "mempalace_adapter.py")
}

const getPythonCommand = () => process.env.MEMPALACE_ADAPTER_PYTHON || "python"

export const executeAdapter = async (
  _shell: any,
  payload: Record<string, unknown>,
  retries = 3,
) => {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const child = spawn(getPythonCommand(), [getAdapterPath()], {
          stdio: ["pipe", "pipe", "pipe"],
        })

        const stdout: Buffer[] = []
        const stderr: Buffer[] = []

        child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)))
        child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)))
        child.on("error", reject)
        child.on("close", (code) => {
          if (code === 0) {
            resolve(Buffer.concat(stdout).toString("utf8"))
            return
          }
          reject(new Error(Buffer.concat(stderr).toString("utf8") || `Adapter exited with code ${code}`))
        })

        child.stdin.write(JSON.stringify(payload), "utf8")
        child.stdin.end()
      })

      return JSON.parse(text)
    } catch (error) {
      lastError = error
      if (attempt === retries) throw error
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }
  throw lastError
}
