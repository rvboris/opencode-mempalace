# OpenCode MemPalace Plugin

OpenCode memory layer with private retrieval and safe autosave.

[Русская версия](./README.ru.md)

## Why it matters

Keep OpenCode context-aware without extra prompts.

- **Finds relevant memory automatically** before normal replies
- **Saves durable knowledge quietly** in the background
- **Keeps writes safe** through one controlled tool
- **Protects sensitive data** before anything is stored

## Quick start

Install MemPalace:

```bash
pip install mempalace
mempalace init <dir>
mempalace mine <dir>
```

Add the plugin to `opencode.json`:

```json
{
  "plugin": ["@rvboris/opencode-mempalace"]
}
```

That is enough to enable memory search, autosave, and `mempalace_memory`.

## What you get

- hidden memory lookup before answers
- autosave on session lifecycle events
- separate user and project memory
- one safe memory tool for the model
- local Python bridge to MemPalace

The plugin does **not** require the MemPalace MCP server.

## The one tool: `mempalace_memory`

This is the only tool the model needs.

### Modes

- **`save`** — store a durable preference, fact, or decision
- **`search`** — find relevant memory by query
- **`kg_add`** — add a structured fact to the knowledge graph
- **`diary_write`** — save a short work note or daily log
- **`mine_messages`** — internal autosave mode used by the plugin

### Examples

Save a user preference:

```text
mempalace_memory
  mode: save
  scope: user
  room: preferences
  content: Prefers concise responses and numbered steps.
```

Save a project decision:

```text
mempalace_memory
  mode: save
  scope: project
  room: decisions
  content: Use Bun for builds and tests.
```

Search memory:

```text
mempalace_memory
  mode: search
  scope: project
  room: workflow
  query: build command
  limit: 3
```

Add a graph fact:

```text
mempalace_memory
  mode: kg_add
  subject: my-repo
  predicate: uses
  object: bun
```

## Memory areas

**User memory**

- `preferences`
- `workflow`
- `communication`

Use it for stable cross-project habits and preferences.

**Project memory**

- `architecture`
- `workflow`
- `decisions`
- `bugs`
- `setup`

Use it for repository-specific knowledge.

## Configuration

Optional config file: `~/.config/opencode/mempalace.jsonc`

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

Useful environment variables:

- `MEMPALACE_AUTOSAVE_ENABLED`
- `MEMPALACE_RETRIEVAL_ENABLED`
- `MEMPALACE_KEYWORD_SAVE_ENABLED`
- `MEMPALACE_PRIVACY_REDACTION_ENABLED`
- `MEMPALACE_AUTOSAVE_LOG_FILE`
- `MEMPALACE_ADAPTER_PYTHON`

## Privacy

- respects `<private>...</private>` blocks
- redacts common secrets before writes
- skips fully private content

## Project docs

- Release history: [`CHANGELOG.md`](./CHANGELOG.md)
- Changelog rules: [`CONTRIBUTING.md#changelog`](./CONTRIBUTING.md#changelog)

## Local development

Load from source:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///ABSOLUTE/PATH/TO/mempalace-autosave/plugin/index.ts"
  ]
}
```

Build:

```bash
npm run build
```

Debug logs:

```bash
opencode --log-level DEBUG
```

File log: `~/.mempalace/opencode_autosave.log`

## Links

- OpenCode: https://opencode.ai
- MemPalace: https://github.com/milla-jovovich/mempalace
