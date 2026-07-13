import { afterEach, describe, expect, it } from "bun:test"
import { EventEmitter } from "node:events"
import path from "node:path"
import { spawnSync } from "node:child_process"
import type { AdapterRequest } from "../plugin/lib/types"

class FakeStream extends EventEmitter {}

type FakeSpawnBehavior = (child: FakeChild) => void

const emptyStdoutBehavior: FakeSpawnBehavior = (child) => {
  child.stderr.emit("data", Buffer.from('{"error":"stderr payload"}'))
  child.emit("close", 0)
}

const spawnBehaviors: FakeSpawnBehavior[] = []
let spawnBehavior: FakeSpawnBehavior = emptyStdoutBehavior

class FakeChild extends EventEmitter {
  stdout = new FakeStream()
  stderr = new FakeStream()
  stdin = {
    write: (_chunk: string, _encoding: BufferEncoding) => {},
    end: () => {
      const behavior = spawnBehaviors.shift() ?? spawnBehavior
      queueMicrotask(() => behavior(this))
    },
  }

  kill() {
    this.emit("close", null)
  }
}

const { executeAdapter, resetAdapterTestHooks, resolvePython, setAdapterDelayForTests, setAdapterSpawnForTests } = await import(
  "../plugin/lib/adapter"
)

setAdapterSpawnForTests(() => new FakeChild() as never)

describe("adapter bridge", () => {
  afterEach(() => {
    spawnBehaviors.length = 0
    spawnBehavior = emptyStdoutBehavior
    resetAdapterTestHooks()
    setAdapterSpawnForTests(() => new FakeChild() as never)
  })

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

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
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
      source_file: null,
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

  it("serializes write-like adapter calls", async () => {
    const order: string[] = []
    spawnBehavior = (child) => {
      order.push("start")
      setTimeout(() => {
        order.push("finish")
        child.stdout.emit("data", Buffer.from('{"success":true}'))
        child.emit("close", 0)
      }, 1)
    }

    const first = executeAdapter(undefined, {
      mode: "save",
      wing: "wing_user_profile",
      room: "workflow",
      content: "first",
      added_by: "test",
    })
    const second = executeAdapter(undefined, {
      mode: "save",
      wing: "wing_user_profile",
      room: "workflow",
      content: "second",
      added_by: "test",
    })

    await Promise.all([first, second])

    expect(order).toEqual(["start", "finish", "start", "finish"])
  })

  it("does not serialize search adapter calls", async () => {
    const order: string[] = []
    spawnBehavior = (child) => {
      order.push("start")
      setTimeout(() => {
        order.push("finish")
        child.stdout.emit("data", Buffer.from('{"success":true}'))
        child.emit("close", 0)
      }, 1)
    }

    const first = executeAdapter(undefined, {
      mode: "search",
      query: "first",
      wing: "wing_user_profile",
      room: "workflow",
      limit: 1,
    })
    const second = executeAdapter(undefined, {
      mode: "search",
      query: "second",
      wing: "wing_user_profile",
      room: "workflow",
      limit: 1,
    })

    await Promise.all([first, second])

    expect(order.slice(0, 2)).toEqual(["start", "start"])
  })

  it("retries write-like calls when palace lock is held", async () => {
    const delays: number[] = []
    setAdapterDelayForTests((ms: number) => {
      delays.push(ms)
      return Promise.resolve()
    })
    spawnBehaviors.push(
      (child) => {
        child.stderr.emit("data", Buffer.from("palace /tmp/demo is held by PID 42"))
        child.emit("close", 1)
      },
      (child) => {
        child.stdout.emit("data", Buffer.from('{"success":true,"retried":true}'))
        child.emit("close", 0)
      },
    )

    const result = await executeAdapter(undefined, {
      mode: "save",
      wing: "wing_user_profile",
      room: "workflow",
      content: "retry",
      added_by: "test",
    })

    expect(result).toEqual({ success: true, retried: true })
    expect(delays).toEqual([50])
  })

  it("does not retry non-lock adapter failures", async () => {
    let attempts = 0
    spawnBehavior = (child) => {
      attempts += 1
      child.stderr.emit("data", Buffer.from("plain adapter failure"))
      child.emit("close", 1)
    }

    await expect(
      executeAdapter(undefined, {
        mode: "save",
        wing: "wing_user_profile",
        room: "workflow",
        content: "fail",
        added_by: "test",
      }),
    ).rejects.toThrow("plain adapter failure")

    expect(attempts).toBe(1)
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

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
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

  it("forwards source_file filter in search mode", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "search",
      query: "test",
      wing: "wing_project_demo",
      room: "workflow",
      limit: 1,
      source_file: "/demo/src/app.ts",
    }

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout).source_file).toBe("/demo/src/app.ts")
  })

  it("dispatches delete mode to tool_delete_drawer", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "delete",
      drawer_id: "drawer_test_abc",
    }

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    expect(JSON.parse(result.stdout)).toEqual({ success: true, deleted: "drawer_test_abc" })
  })

  it("dispatches delete_by_source with dry_run default", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "delete_by_source",
      source_file: "/demo/old.jsonl",
      dry_run: true,
    }

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout)
    expect(parsed.dry_run).toBe(true)
    expect(parsed.source_file).toBe("/demo/old.jsonl")
  })

  it("dispatches kg_query with direction", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "kg_query",
      entity: "my-repo",
      direction: "outgoing",
    }

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout)
    expect(parsed.entity).toBe("my-repo")
    expect(parsed.direction).toBe("outgoing")
    expect(parsed.facts).toEqual([])
  })

  it("dispatches diary_read with last_n", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "diary_read",
      agent_name: "opencode",
      last_n: 5,
    }

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout)
    expect(parsed.agent_name).toBe("opencode")
    expect(parsed.last_n).toBe(5)
  })

  it("dispatches checkpoint with items and diary", () => {
    const fixtureRoot = path.join(import.meta.dir, "fixtures", "fake_mempalace")
    const pythonPathParts = [fixtureRoot, process.env.PYTHONPATH].filter(Boolean)
    const payload: AdapterRequest = {
      mode: "checkpoint",
      items: [
        { wing: "wing_user", room: "preferences", content: "prefers dark mode" },
        { wing: "wing_project", room: "decisions", content: "uses bun" },
      ],
      diary: { agent_name: "test", entry: "batch saved", topic: "feature" },
      dedup_threshold: 0.85,
    }

    const result = spawnSync(resolvePython() ?? "python3", [path.join(process.cwd(), "bridge", "mempalace_adapter.py")], {
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: {
        ...process.env,
        PYTHONPATH: pythonPathParts.join(path.delimiter),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe("")
    const parsed = JSON.parse(result.stdout)
    expect(parsed.items_count).toBe(2)
    expect(parsed.added).toEqual([])
  })
})
