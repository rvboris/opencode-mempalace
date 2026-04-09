import { describe, expect, it } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

describe("writeLog", () => {
  it("forwards logs to client.app.log", async () => {
    const calls: any[] = []
    const { resetLogger, setLogger, writeLog } = await import("../plugin/lib/log")
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mempalace-log-"))
    const logFile = path.join(tempDir, "autosave.log")
    process.env.MEMPALACE_AUTOSAVE_LOG_FILE = logFile
    setLogger({
      app: {
        log: async (input: { body: any }) => {
          calls.push(input)
          return true
        },
      },
    })
    await writeLog("INFO", "test message", { sessionId: "sess-1" })

    expect(calls.length).toBe(1)
    expect(calls[0].body.service).toBe("mempalace-autosave")
    expect(calls[0].body.message).toBe("test message")
    expect(calls[0].body.extra.sessionId).toBe("sess-1")
    const fileContents = await fs.readFile(logFile, "utf8")
    expect(fileContents).toContain("test message")
    resetLogger()
    delete process.env.MEMPALACE_AUTOSAVE_LOG_FILE
  })
})
