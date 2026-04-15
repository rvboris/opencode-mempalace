# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and the project aims to follow Semantic Versioning.

## [Unreleased]

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
