# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and versions are managed by `release-please`.

## [2.0.1](https://github.com/rvboris/opencode-mempalace/compare/opencode-mempalace-v2.0.0...opencode-mempalace-v2.0.1) (2026-10-04)


### Miscellaneous Chores

* prepare 2.0.1 release ([6c1d137](https://github.com/rvboris/opencode-mempalace/commit/6c1d137b769ae4c86f94e13eec59cb546af8d6ef))

## [2.0.0](https://github.com/rvboris/opencode-mempalace/compare/opencode-mempalace-v1.0.0...opencode-mempalace-v2.0.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* migrate Mempalace to OpenCode V2 for 1.0.0

### Features

* make memory retrieval visible to users ([63a72d4](https://github.com/rvboris/opencode-mempalace/commit/63a72d41cf867358181692e147575ad699d9642a))
* migrate Mempalace to OpenCode V2 for 1.0.0 ([e3b0ad6](https://github.com/rvboris/opencode-mempalace/commit/e3b0ad6e2fe0f3ac13b5a35af3f6911abe952a2b))


### Bug Fixes

* resolve lint warning and ci coverage report compatibility ([5852081](https://github.com/rvboris/opencode-mempalace/commit/585208177f3e427495b75a833b15a1e4168b7253))

## [1.0.0] - Pending release

### Changed

- **Breaking:** Require OpenCode V2; update plugin configuration to the `plugins` key and configure the HUD through V2 `cli.json`.
- Project memory wings use the project basename as their canonical identity. Existing wings created with V1 arbitrary display names are not silently migrated; review and migrate them explicitly if needed.
- Update the HUD plugin loading example to use the package root/directory, supported by V2 CLI plugin discovery.

## [0.5.0](https://github.com/rvboris/opencode-mempalace/compare/opencode-mempalace-v0.4.0...opencode-mempalace-v0.5.0) (2026-07-13)

### Added

- Five `mempalace_memory` modes: `checkpoint`, `delete`, `delete_by_source`, `kg_query`, and `diary_read`.
- `source_file` filter for scoped memory search.
- TUI HUD retrieval fallbacks: `MEM found N`, `MEM no hits`, and `MEM searched`.
- Adapter test hooks for deterministic queue/retry coverage.

### Changed

- HUD combines model judge verdicts with retrieval evidence, so sessions with memory searches no longer appear as `MEM quiet`.
- Write-like adapter operations are serialized and retry MemPalace palace-lock contention (`held by PID`).
- Python interpreter resolution prefers the `mempalace` CLI shebang before falling back to `python3`/`python`.
- README and README.ru describe current behavior only, including HUD states, autosave filtering, and adapter reliability.

### Fixed

- Autosave mining skips low-signal transcript fragments before calling `mine_messages`.
- Adapter errors are clearer when Python is missing or adapter stdout is empty.
- `MineMessagesAdapterRequest` includes `palace_path`, matching the Python bridge contract.
- Removed unused autosave instruction code.

## [0.4.0](https://github.com/rvboris/opencode-mempalace/compare/opencode-mempalace-v0.3.0...opencode-mempalace-v0.4.0) (2026-05-11)

### Features

- Make memory retrieval visible to users.

### Bug Fixes

- Resolve lint warning and CI coverage report compatibility.

## [0.3.0] - 2026-05-01

### Added

- `mempalace_status` tool for checking retrieval hit rate, autosave outcomes, memory previews, and cumulative counters so users can evaluate whether the plugin helps.
- TUI HUD plugin rendering compact per-session memory stats in the OpenCode prompt area with color-coded indicators for skipped and failed autosaves.
- Per-session status tracking: each session records its own retrieval hits, autosave outcomes, and manual writes in a v2 status schema.

### Fixed

- Autosave transcript encoding in the Python bridge uses explicit UTF-8 byte writes to avoid platform-specific encoding failures.

## [0.2.1] - 2026-04-24

### Fixed

- Restored memory search and save calls after newer MemPalace versions redirected adapter JSON output away from stdout.
- Added clearer adapter errors when the Python bridge exits successfully without returning a JSON payload.
- Updated GitHub Actions artifact steps for Node 24 compatibility in the release pipeline.

## [0.2.0] - 2026-04-16

### Added

- `CHANGELOG.md` to keep user-facing release notes in the repository.
- `CONTRIBUTING.md` with rules for updating changelog entries consistently.
- Shared constants, OpenCode helpers, and stronger local TypeScript types across the plugin.

### Changed

- Reworked autosave and retrieval flow around hybrid-mode behavior in plugin hooks and the adapter bridge.
- Simplified public docs in `README.md` and `README.ru.md` to focus on quick setup and practical usage.
- Tightened config, logging, context, and memory tool handling to rely on shared runtime helpers.

### Fixed

- Improved overlapping-session handling and direct adapter execution paths used by autosave.
- Hardened config parsing, privacy behavior, and structured adapter error handling.
- Updated tests to reflect current wrapper-tool and lifecycle behavior.

## [0.1.0]

### Added

- Initial release of the OpenCode MemPalace plugin.
- Hidden memory retrieval before normal model responses.
- Autosave hooks for session lifecycle events.
- A safe `mempalace_memory` wrapper tool with user and project scopes.
- Privacy filtering and a local Python adapter for MemPalace integration.
