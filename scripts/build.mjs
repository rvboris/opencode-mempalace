import { cp, mkdir, rm } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import path from "node:path"

const root = process.cwd()
const dist = path.join(root, "dist")
const require = createRequire(import.meta.url)
const tscEntrypoint = require.resolve("typescript/bin/tsc")

await rm(dist, { recursive: true, force: true })

const result = spawnSync(process.execPath, [tscEntrypoint, "-p", "tsconfig.json"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

await mkdir(path.join(dist, "bridge"), { recursive: true })
await cp(path.join(root, "bridge", "mempalace_adapter.py"), path.join(dist, "bridge", "mempalace_adapter.py"))
