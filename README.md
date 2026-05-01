# @rvboris/opencode-mempalace

**Persistent memory for OpenCode — zero config, visible results.**

Your AI coding assistant forgets everything between sessions. This plugin fixes that. It silently saves what matters and finds it when needed — no extra prompts, no manual effort.

[Русская версия](./README.ru.md)

---

## What it does

Before every reply, the plugin searches your memory for relevant context. After every session, it quietly saves durable knowledge. You never have to say "remember this" — but when you do, it listens.

```
You: "What build tool does this project use?"
AI:  [searches memory] → "Bun. You decided that on April 10."
```

### The result

- Answers informed by your past decisions, preferences, and project history
- No repeated explanations across sessions
- Privacy-first: secrets and private blocks are never stored
- Works entirely locally — no cloud, no API keys, no MCP server

## Quick start

**Prerequisites:** [OpenCode](https://opencode.ai) and Python 3.10+ with pip.

```bash
pip install mempalace
mempalace init ~/.mempalace/palace
```

Add to `opencode.json`:

```json
{
  "plugin": ["@rvboris/opencode-mempalace"]
}
```

That's it. Memory search, autosave, and both tools are active immediately.

## Features

### Hidden retrieval

Before each answer, the plugin injects a search instruction so the model checks your memory first. No tool call noise in the chat — the context just appears.

### Background autosave

On session idle, compaction, or close, the plugin mines the conversation transcript for durable facts and saves them to the right memory area automatically.

### `mempalace_memory` — the one tool

Four modes, one interface:

| Mode | Purpose |
|---|---|
| `save` | Store a preference, fact, or decision |
| `search` | Find relevant memory by query |
| `kg_add` | Add a structured fact to the knowledge graph |
| `diary_write` | Save a short work note |

Examples:

```text
mempalace_memory  mode: save  scope: user  room: preferences  content: Prefers concise responses.
```

```text
mempalace_memory  mode: search  scope: project  room: decisions  query: build tool
```

```text
mempalace_memory  mode: kg_add  subject: my-repo  predicate: uses  object: bun
```

### `mempalace_status` — visible proof

Check whether the plugin is actually helping:

```text
mempalace_status
```

Shows retrieval hit rate, last autosave outcome, memory previews, and cumulative counters. Use `verbose: true` for full detail.

### TUI HUD — memory stats in your prompt

A compact session stats line appears in the OpenCode prompt area:

```
MEM hits 3 · saved 2 · failed 0 · writes 1
```

Color-coded indicators for `SKIPPED` and `FAILED` states. Requires a `tui.json` entry (see below).

## Memory areas

**User memory** — cross-project preferences and habits:

- `preferences` — coding style, communication preferences
- `workflow` — working patterns, tool choices
- `communication` — language, response format

**Project memory** — repository-specific knowledge:

- `architecture` — design decisions, patterns
- `workflow` — build commands, CI config
- `decisions` — ADRs, trade-offs
- `bugs` — known issues, workarounds
- `setup` — environment setup, dependencies

## Privacy

- `<private>...</private>` blocks are respected and never stored
- Common secrets (API keys, tokens, passwords) are redacted before writes
- Fully private content is skipped entirely

## Configuration

Optional config file at `~/.config/opencode/mempalace.jsonc`:

```jsonc
{
  "autosaveEnabled": true,
  "retrievalEnabled": true,
  "keywordSaveEnabled": true,
  "maxInjectedItems": 6,
  "retrievalQueryLimit": 5,
  "privacyRedactionEnabled": true
}
```

Environment variables:

| Variable | Purpose |
|---|---|
| `MEMPALACE_AUTOSAVE_ENABLED` | Toggle background autosave |
| `MEMPALACE_RETRIEVAL_ENABLED` | Toggle hidden retrieval |
| `MEMPALACE_KEYWORD_SAVE_ENABLED` | Toggle keyword-triggered saves |
| `MEMPALACE_PRIVACY_REDACTION_ENABLED` | Toggle secret redaction |
| `MEMPALACE_ADAPTER_PYTHON` | Path to Python binary |
| `MEMPALACE_ADAPTER_TIMEOUT_MS` | Adapter timeout (default 15000) |

## TUI HUD setup

To enable the prompt-area stats display, add a `tui.json` in your OpenCode config directory:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "file:///path/to/mempalace-autosave/plugin/tui/index.tsx"
  ]
}
```

Or when installed from npm, use the package entry:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@rvboris/opencode-mempalace/tui"]
}
```

## How it works

```
User message
  → system hook injects "search memory first" instruction
  → model calls mempalace_memory [search]
  → results inform the answer

Session ends / idles
  → event hook mines transcript
  → Python adapter saves durable facts via MemPalace
```

The plugin uses a local Python bridge (`bridge/mempalace_adapter.py`) to communicate with MemPalace. It does **not** require the MemPalace MCP server.

## Compatibility

| Requirement | Version |
|---|---|
| OpenCode | latest |
| Python | 3.10+ |
| MemPalace | 3.3+ |
| OS | macOS, Linux, Windows |

## Project docs

- [Changelog](./CHANGELOG.md) — release history
- [Contributing](./CONTRIBUTING.md) — changelog rules

## Local development

```bash
git clone https://github.com/rvboris/opencode-mempalace.git
cd opencode-mempalace/mempalace-autosave
npm install
npm run build
```

Load from source in `opencode.json`:

```jsonc
{
  "plugin": ["file:///ABSOLUTE/PATH/TO/mempalace-autosave/plugin/index.ts"]
}
```

Debug: `opencode --log-level DEBUG` or check `~/.mempalace/opencode_autosave.log`.

## Links

- OpenCode: https://opencode.ai
- MemPalace: https://github.com/milla-jovovich/mempalace
- npm: https://www.npmjs.com/package/@rvboris/opencode-mempalace

## License

MIT
