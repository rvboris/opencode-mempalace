import { describe, expect, it, mock } from "bun:test"
import { EventEmitter } from "node:events"
import path from "node:path"
import { spawnSync } from "node:child_process"
import type { AdapterRequest } from "../plugin/lib/types"

class FakeStream extends EventEmitter {}

class FakeChild extends EventEmitter {
  stdout = new FakeStream()
  stderr = new FakeStream()
  stdin = {
    write: (_chunk: string, _encoding: BufferEncoding) => {},
    end: () => {
      queueMicrotask(() => {
        this.stderr.emit("data", Buffer.from('{"error":"stderr payload"}'))
        this.emit("close", 0)
      })
    },
  }

  kill() {
    this.emit("close", null)
  }
}

mock.module("node:child_process", () => ({
  spawn: () => new FakeChild(),
}))

const { executeAdapter } = await import("../plugin/lib/adapter")

describe("adapter bridge", () => {
  it("restores stdout after mempalace import-time redirection", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "search",
      query: "test",
      wing: "wing_project_demo",
      room: "workflow",
      limit: 1,
    }

    const result = spawnSync("python", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stdout).not.toBe("")
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      mode: "search",
      query: "test",
      wing: "wing_project_demo",
      room: "workflow",
      limit: 1,
    })
  })

  it("raises a clear error when adapter exits with empty stdout", async () => {
    await expect(
      executeAdapter(undefined, {
        mode: "search",
        query: "prefs",
        wing: "wing_user_profile",
        room: "workflow",
        limit: 1,
      }),
    ).rejects.toThrow("Adapter returned empty stdout")

    await expect(
      executeAdapter(undefined, {
        mode: "search",
        query: "prefs",
        wing: "wing_user_profile",
        room: "workflow",
        limit: 1,
      }),
    ).rejects.toThrow("stderr payload")
  })

  it("handles mine_messages payloads with invalid unicode surrogates", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "mine_messages",
      transcript: "USER: Борис\udc81",
      wing: "wing_project_demo",
      extract_mode: "general",
      agent: "opencode",
    }

    const result = spawnSync("python", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toEqual({
      success: true,
      mode: "mine_messages",
      wing: "wing_project_demo",
    })
  })
})
