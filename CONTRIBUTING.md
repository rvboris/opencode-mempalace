# Contributing

## Changelog

Update `CHANGELOG.md` in the same branch as the code change when the behavior is user-visible, operationally important, or affects release notes.

### What to include

- Write for users and maintainers, not as a raw git diff.
- Record only notable changes: new features, behavior changes, important fixes, removals, or security-impacting updates.
- Prefer one short bullet per change with enough context to explain why it matters.
- Group entries under these sections when relevant: `Added`, `Changed`, `Fixed`, `Removed`, `Security`.

### What to skip

- Pure refactors with no visible effect.
- Test-only changes unless they cover a regression users should know about.
- Formatting, renames, or internal churn that does not change behavior.

### Workflow

- Add new entries under `## [Unreleased]`.
- Keep related bullets grouped and deduplicated before merging.
- On release, move the `Unreleased` items into a new versioned section with the release date.
- Keep wording concise and consistent across English and Russian user-facing docs when both are updated.

### Style examples

- Good: `Added adapter timeout handling for autosave writes to avoid stuck background saves.`
- Good: `Fixed private blocks being included in autosave payloads.`
- Avoid: `Updated files and cleaned code.`
