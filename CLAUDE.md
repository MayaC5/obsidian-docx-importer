# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node.js is not system-installed. Load it via nvm before running any command:
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

| Command | Purpose |
|---|---|
| `npm run dev` | Watch mode — rebuilds on file change; **inline sourcemaps** enabled |
| `npm run build` | Type-check then produce production `main.js`; **no sourcemaps** |

There are no tests. TypeScript type-checking runs as part of `npm run build` via `tsc -noEmit`.

## Deploying to Obsidian vault

After building, copy the plugin files into the vault:
```bash
cp main.js manifest.json /path/to/vault/.obsidian/plugins/docx-importer/
```
Then reload the plugin in Obsidian: **Settings → Community plugins → reload icon** next to DOCX Importer.

## Architecture

This is a desktop-only Obsidian community plugin (TypeScript + esbuild). Everything bundles into a single `main.js` at the repo root, which is what Obsidian loads.

**Entry point:** `src/main.ts` — registers the ribbon icon and command palette command, both of which open `ImportModal`.

**Conversion pipeline** (`src/converter.ts`):
```
.docx (ArrayBuffer)
  → extractBodyRunColors()  (JSZip + DOMParser on word/document.xml) → runColors[]
  → mammoth.js              (styleMap + transformDocument + convertImage) → HTML
  → fixNestedLists()        (DOM-patched) → HTML
  → TurndownService         (custom rules) → Markdown
  → regex rewrite           → ![[attachments/name.ext]] links
```

Key details in `converter.ts`:
- `BASE_STYLE_MAP` maps DOCX numbering levels to nested `ol`/`ul` and maps `highlight => mark`.
- `extractBodyRunColors()` opens the DOCX ZIP with JSZip, parses `word/document.xml`, and returns an array of hex color strings (or `null`) for every `<w:r>` in `<w:body>` in document order. This is necessary because mammoth silently drops `w:color`.
- `transformDocument: transforms.run(fn)` uses a counter to correlate each mammoth run with its position in `runColors[]`, injecting a fake `styleName = "color-RRGGBB"` on colored runs. Dynamic styleMap entries (`r[style-name='color-RRGGBB'] => span[style='color: #RRGGBB']`) then emit the inline style.
- `fixNestedLists()` runs two DOM passes: (1) move stray `ol`/`ul` direct children of another list into the preceding `<li>`; (2) strip empty `<p>` elements between sibling lists (Word inserts these at list-type boundaries), then merge the now-adjacent sibling lists by appending the second into the last `<li>` of the first. Processed right-to-left so deeper nesting resolves before shallower.
- `buildTurndownService()` adds two custom rules: `<mark>` → `==content==` (Obsidian highlight syntax), and `<span style="color:...">` → preserved as raw HTML (Obsidian renders inline HTML in markdown).

**Vault write flow** (`src/fileManager.ts`):
```
[parent TFolder]/
└── [folderName]/
    ├── [folderName].md          ← app.vault.create()
    ├── [folderName].docx        ← app.vault.createBinary() — original copied in, renamed to folderName
    └── attachments/             ← only created when images exist
        └── imageN.ext           ← app.vault.createBinary()
```
All vault writes go through `app.vault` API (not raw `fs`) so Obsidian tracks the new files.

**UI flow** (`src/ui/ImportModal.ts`):
1. User picks a `.docx` via Electron `dialog` API (`require('electron').remote`), types a subfolder name (pre-filled from filename), and picks a parent folder via `FolderSuggester`.
2. On confirm: validate (non-empty name, no existing subfolder conflict) → read file with Node `fs.readFileSync` → run conversion → write files → open the new `.md` in the editor.

**Debug export:** The modal also has an "Export HTML (debug)" button that calls `convertDocxToHtml()` (exported from `converter.ts`). It writes `raw.html` (mammoth output before DOM patching) and `fixed.html` (after `fixNestedLists()`) into the target folder without doing the full markdown conversion. Useful for diagnosing list or styling issues.

## Key constraints

- `isDesktopOnly: true` in `manifest.json` — no mobile support; Electron and Node.js APIs are safe to use.
- `electron` and all Node.js builtins are marked external in `esbuild.config.mjs` — do not import them at the top level; use `require()` inside functions so the bundle stays valid. JSZip is an exception: it is bundled (not external) and is also loaded via `require()` inside the function for consistency.
- Image links in generated Markdown use Obsidian wikilink syntax: `![[attachments/image1.png]]`, not standard `![](...)`.
- The attachment subfolder name is hardcoded as `attachments`.
- The imported `.docx` is always renamed to `[folderName].docx` inside the new subfolder, regardless of the original filename.
- Text color in footnotes/endnotes is not preserved — `extractBodyRunColors` only indexes `<w:body>` runs. Theme-based colors (non-hex `w:themeColor` references) are also skipped.

## Known issues and non-obvious fixes

### Mixed ordered/unordered list nesting

When a DOCX mixes list types at nested levels (e.g. numbered → bullets → numbered), Word stores each type change as a separate list definition (`numId`). mammoth emits these as separate top-level `<ol>`/`<ul>` siblings rather than nested elements.

**The non-obvious part:** Word also inserts a blank paragraph (`<p></p>`) between each style-change boundary. Any fix relying on the CSS adjacent-sibling combinator (`ul + ol`) silently fails because the empty `<p>` breaks adjacency.

**Correct fix (already implemented):** Strip the empty `<p>` elements first, then merge adjacent sibling lists. Both steps together are required. See `fixNestedLists()`.

### mammoth drops `w:color`

mammoth's `body-reader.js` reads `w:highlight` but not `w:color`. The `Run` document model has no `color` property. The workaround is the two-pass approach in `convertDocxToMarkdown`: pre-parse the raw XML for colors, then inject fake `styleName` values via `transformDocument`. Do not attempt to use `styleMap` alone — the color value must be known before the styleMap entry can be constructed.

mammoth's `transforms` API is not exposed in its TypeScript type definitions — the cast `(mammoth as any).transforms` in `converter.ts` is intentional, not a workaround to remove.

### `isEmptyPara` and `&nbsp;`

`fixNestedLists()` detects empty paragraphs with `.replace(/[\s ]/g, '') === ''`. Word marks empty paragraphs with a non-breaking space (`&nbsp;` / U+00A0). `String.prototype.trim()` does **not** strip `&nbsp;`, so using `trim()` here silently fails and the empty-paragraph detection breaks, causing list merging to stop working.

### mammoth + esbuild

mammoth.js uses CommonJS with dynamic `require` calls internally. If bundling produces errors or runtime `require` failures, the fix is to add `mammoth` to the `external` array in `esbuild.config.mjs` and load it via `require('mammoth')` at runtime — it is available as a local module in the Obsidian plugin folder if copied there.
