# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and versions are managed by `release-please` starting after `v0.3.0`.

## [Unreleased]

## [0.3.0] - 2026-05-01

### Added

- `mempalace_status` tool for checking retrieval hit rate, autosave outcomes, memory previews, and cumulative counters so users can evaluate whether the plugin helps.
- TUI HUD plugin rendering compact per-session memory stats in the OpenCode prompt area with color-coded indicators for skipped and failed autosaves.
- Per-session status tracking: each session now records its own retrieval hits, autosave outcomes, and manual writes in a v2 status schema.

### Fixed

- Autosave transcript encoding in the Python bridge now uses explicit UTF-8 byte writes to avoid platform-specific encoding failures.

## [0.2.1] - 2026-04-24

### Fixed

- Restored memory search and save calls after newer MemPalace versions redirected adapter JSON output away from stdout.
- Added clearer adapter errors when the Python bridge exits successfully without returning a JSON payload.
- Updated GitHub Actions artifact steps for Node 24 compatibility in the release pipeline.

## [0.2.0] - 2026-04-16

### Added

- `CHANGELOG.md` to keep a user-facing release history in the repository.
- `CONTRIBUTING.md` with rules for updating changelog entries consistently.
- Shared constants, OpenCode helpers, and stronger local TypeScript types across the plugin.

### Changed

- Reworked autosave and retrieval flow around the hybrid-mode changes in the plugin hooks and adapter bridge.
- Simplified the public docs in `README.md` and `README.ru.md` to focus on quick setup and practical usage.
- Tightened config, logging, context, and memory tool handling to rely on shared runtime helpers.

### Fixed

- Improved overlapping-session handling and direct adapter execution paths used by autosave.
- Hardened config parsing, privacy-related behavior, and structured adapter error handling.
- Updated tests to reflect the current wrapper-tool and lifecycle behavior.

## [0.1.0]

### Added

- Initial release of the OpenCode MemPalace plugin.
- Hidden memory retrieval before normal model responses.
- Autosave hooks for session lifecycle events.
- A safe `mempalace_memory` wrapper tool with user and project scopes.
- Privacy filtering and a local Python adapter for MemPalace integration.
