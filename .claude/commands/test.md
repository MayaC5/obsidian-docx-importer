Build the plugin and deploy it to the local Obsidian test vault.

## Steps

1. Run the production build:
   ```bash
   export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && npm run build
   ```
2. Copy the plugin files to the vault:
   ```bash
   cp main.js manifest.json styles.css "/home/user/Documents/Test/.obsidian/plugins/docx-importer/"
   ```
3. Confirm success and remind the user to reload the plugin in Obsidian:
   **Settings → Community plugins → reload icon** next to DOCX Importer.
