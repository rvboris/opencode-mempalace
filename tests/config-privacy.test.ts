import { describe, expect, it } from "bun:test"

const { loadConfig, resetConfig } = await import("../plugin/lib/config")
const { isFullyPrivate, redactSecrets, stripPrivateContent } = await import("../plugin/lib/privacy")
const { buildRetrievalInstruction } = await import("../plugin/lib/context")

describe("config and privacy", () => {
  it("loads default config", async () => {
    resetConfig()
    const config = await loadConfig()
    expect(config.autosaveEnabled).toBe(true)
    expect(config.retrievalEnabled).toBe(true)
    expect(config.keywordSaveEnabled).toBe(true)
    expect(config.autoMineExtractMode).toBe("general")
    expect(config.maxInjectedItems).toBeGreaterThan(0)
    expect(config.retrievalQueryLimit).toBeGreaterThan(0)
  })

  it("redacts private and secret content", () => {
    expect(stripPrivateContent("hello <private>secret</private>")).toContain("[REDACTED_PRIVATE]")
    expect(redactSecrets("token=sk-abcdef1234567890SECRET")).toContain("[REDACTED_SECRET]")
    expect(isFullyPrivate("<private>only secret</private>")).toBe(true)
  })

  it("builds retrieval instruction with scope hints", () => {
    const instruction = buildRetrievalInstruction({
      projectName: "Demo",
      projectWingPrefix: "wing_project",
      userWingPrefix: "wing_user",
      maxInjectedItems: 5,
      retrievalQueryLimit: 3,
      lastUserMessage: "How do we build this project?",
    })
    expect(instruction).toContain("wing_user_profile")
    expect(instruction).toContain("wing_project_demo")
  })

  it("supports literal keyword patterns safely", async () => {
    process.env.MEMPALACE_KEYWORD_SAVE_ENABLED = "true"
    resetConfig()
    const config = await loadConfig()
    expect(config.keywordPatterns.length).toBeGreaterThan(0)
    delete process.env.MEMPALACE_KEYWORD_SAVE_ENABLED
    resetConfig()
  })
})
