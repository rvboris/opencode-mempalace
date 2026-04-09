import { describe, expect, it } from "bun:test"

const { chatParamHooks } = await import("../plugin/hooks/chat-params")
const { getCurrentTurnSessionId, resetAllStates } = await import("../plugin/lib/autosave")

describe("chatParamHooks", () => {
  it("binds current turn session id from chat.params", async () => {
    resetAllStates()
    const hooks = chatParamHooks()
    await hooks["chat.params"]?.(
      { sessionID: "turn-1", agent: "main", model: { providerID: "x", modelID: "y" }, provider: {}, message: {} as any },
      { temperature: 0, topP: 1, topK: 1, options: {} },
    )
    expect(getCurrentTurnSessionId()).toBe("turn-1")
  })
})
