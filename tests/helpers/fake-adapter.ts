import { EventEmitter } from "node:events"
import type { AdapterRequest } from "../../plugin/lib/types"

class FakeStream extends EventEmitter {}

/** Fake child process for the adapter spawn seam. Records requests; answers success. */
export class FakeAdapterChild extends EventEmitter {
  stdout = new FakeStream()
  stderr = new FakeStream()
  readonly calls: AdapterRequest[]

  constructor(calls: AdapterRequest[] = []) {
    super()
    this.calls = calls
  }

  fail = false

  stdin = {
    write: (chunk: string, _encoding: BufferEncoding) => {
      this.calls.push(JSON.parse(chunk) as AdapterRequest)
    },
    end: () => {
      queueMicrotask(() => {
        if (this.fail) {
          this.stderr.emit("data", Buffer.from("adapter offline"))
          this.emit("close", 1)
          return
        }
        this.stdout.emit("data", Buffer.from('{"success":true}'))
        this.emit("close", 0)
      })
    },
  }

  kill() {
    this.emit("close", null)
  }
}
