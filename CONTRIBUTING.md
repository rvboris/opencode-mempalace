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

Use Release Please for normal releases:

1. Push conventional commits to `main`.
2. Release Please opens or updates a Release PR with version bump and changelog.
3. CI tests the Release PR automatically.
4. Merge the Release PR.
5. Verify the GitHub Release exists.
6. Verify the npm package version is published.

A Git tag alone is not a GitHub Release. If a release is done manually, complete every step explicitly:

1. Update `package.json`, `.release-please-manifest.json`, and `CHANGELOG.md`.
2. Run `bun test`, `bun run typecheck`, `bun run lint`, `bun run build`, and `npm pack --dry-run`.
3. Commit with `chore(main): release opencode-mempalace X.Y.Z`.
4. Publish with `npm publish --access public` and verify with `npm view @rvboris/opencode-mempalace version`.
5. Create and push tag `opencode-mempalace-vX.Y.Z`.
6. Create the GitHub Release from that tag with changelog notes:
   ```bash
   gh release create opencode-mempalace-vX.Y.Z \
     --repo rvboris/opencode-mempalace \
     --title "opencode-mempalace vX.Y.Z" \
     --notes-file /tmp/opencode-mempalace-X.Y.Z-notes.md
   ```
7. Verify with `gh release view opencode-mempalace-vX.Y.Z --repo rvboris/opencode-mempalace`.

### What gets into the changelog

Release Please extracts changelog entries from commit messages:

- `feat:` and `fix:` commits appear in the release notes.
- `chore:`, `docs:`, `refactor:`, `test:`, `ci:` are excluded.
- Breaking changes (`!`) are highlighted.

### What to skip

- Non-descriptive commit messages (`update files`, `wip`).
- Mixing unrelated changes in a single commit.
- Direct commits to `main` without conventional format when expecting Release Please to cut a release.
- Pushing a release tag without creating or verifying the GitHub Release.

## Manual Changelog

`CHANGELOG.md` is managed by Release Please in the normal release path. Edit it manually only for an explicit manual release, and keep entries user-facing.
