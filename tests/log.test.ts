import { describe, expect, it } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
describe("writeLog", () => {
  it("writes structured logs to the configured local file", async () => {
    const { resetLogger, setLogger, writeLog } = await import("../plugin/lib/log")
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mempalace-log-"))
    const logFile = path.join(tempDir, "autosave.log")
    process.env.MEMPALACE_AUTOSAVE_LOG_FILE = logFile
    setLogger()
    await writeLog("INFO", "test message", { sessionId: "sess-1" })
    const fileContents = await fs.readFile(logFile, "utf8")
    const [entry] = fileContents.trim().split("\n").map((line) => JSON.parse(line))
    expect(entry.level).toBe("INFO")
    expect(entry.message).toBe("test message")
    expect(entry.details.sessionId).toBe("sess-1")
    expect(entry.timestamp).toBeString()
    resetLogger()
    delete process.env.MEMPALACE_AUTOSAVE_LOG_FILE
  })
})
