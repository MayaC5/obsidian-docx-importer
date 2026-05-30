Check whether main.js exceeds 5 MB and alert if so, otherwise report the current size.

## Steps

1. Get the size of main.js in bytes:
   ```bash
   wc -c < main.js
   ```
2. Convert to a human-readable value:
   ```bash
   ls -lh main.js
   ```
3. If the size exceeds 5,242,880 bytes (5 MB):
   - **ALERT**: Report that main.js exceeds 5 MB and warn that Obsidian Sync Standard plan users will not be able to sync this file. Remind the user to run `npm run build` (production build) and not ship a dev build.
4. If the size is within the limit:
   - Report the current size and confirm it is within the Obsidian Sync 5 MB limit.
