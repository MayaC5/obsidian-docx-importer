Bump the plugin version in `manifest.json` and `versions.json`, then start the dev watcher.

## Arguments
`$ARGUMENTS` is `release`, `feature`, or `bug`:
- `release` → bump x, reset y and z to 0  (1.2.3 → 2.0.0)
- `feature` → bump y, reset z to 0        (1.2.3 → 1.3.0)
- `bug`     → bump z                       (1.2.3 → 1.2.4)

## Steps

1. Read current version from `manifest.json` (`"version"` field).
2. Compute the new version based on `$ARGUMENTS`.
3. Update `manifest.json` — set `"version"` to the new version string.
4. Update `package.json` — set `"version"` to the new version string.
5. Update `versions.json` — add `"<new_version>": "1.4.0"` (keep all existing entries).
6. Show the updated files and confirm the new version is correct.
7. Run the dev watcher: `export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && npm run dev`
