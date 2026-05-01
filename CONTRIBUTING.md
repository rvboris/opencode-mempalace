# Contributing

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) and [Release Please](https://github.com/googleapis/release-please) for automated releases.

### Format

```
<type>: <description>

[optional body]
```

### Types

| Type | Bump | Description |
|---|---|---|
| `feat:` | minor | New user-visible feature |
| `fix:` | patch | Bug fix |
| `feat!:` or `fix!:` | major | Breaking change |
| `docs:` | none | Documentation only |
| `chore:` | none | Maintenance, tooling, CI |
| `refactor:` | none | Code restructuring with no behavior change |
| `test:` | none | Test additions or changes |
| `ci:` | none | CI/CD changes |

### Examples

- `feat: add per-session status tracking to mempalace_status`
- `fix: restore adapter stdout handling after mempalace update`
- `docs: update README with TUI HUD setup instructions`
- `chore: bump biome to 2.4`

## Release Process

Releases are fully automated via Release Please:

1. Push conventional commits to `main`.
2. Release Please opens or updates a Release PR with version bump and changelog.
3. CI tests the Release PR automatically.
4. Merge the Release PR to trigger:
   - GitHub Release creation
   - npm publish

### What gets into the changelog

Release Please extracts changelog entries from commit messages:

- `feat:` and `fix:` commits appear in the release notes.
- `chore:`, `docs:`, `refactor:`, `test:`, `ci:` are excluded.
- Breaking changes (`!`) are highlighted.

### What to skip

- Non-descriptive commit messages (`update files`, `wip`).
- Mixing unrelated changes in a single commit.
- Direct commits to `main` without conventional format (they won't trigger releases).

## Manual Changelog

The `CHANGELOG.md` is managed by Release Please starting from `v0.3.0`. Do not edit it manually.
