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
cp main.js manifest.json styles.css /path/to/vault/.obsidian/plugins/docx-importer/
```

Then reload the plugin in Obsidian: **Settings → Community plugins → reload icon** next to DOCX Importer.

## Architecture

This is a desktop-only Obsidian community plugin (TypeScript + esbuild). Everything bundles into a single `main.js` at the repo root, which is what Obsidian loads.

**Entry point:** `src/main.ts` — registers two ribbon icons and two command palette commands: one pair opens `ImportModal` (import), the other triggers `exportActiveNote()` (export). Plugin settings (`PluginSettings`) are loaded via `loadData()`/`saveData()` and exposed through `DocxImporterSettingsTab` (`src/ui/SettingsTab.ts`). Currently one setting: `wikilinksAsPlainText` (controls export behavior only).

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
- The Electron `dialog` opens with `multiSelections` enabled. Single vs. batch mode is determined by how many files the user picks.
- **Single file:** shows a "Note name" text field (pre-filled from filename); validates non-empty name and no existing subfolder conflict before importing.
- **Batch mode (2+ files):** hides the "Note name" field; renders a scrollable file list (CSS in `styles.css`, classes `.docx-batch-*`) where each row has its own editable note name input with real-time conflict detection. After import, opens the first successfully imported `.md`.
- Both modes: user picks a parent folder via `FolderSuggester` (`src/ui/FolderSuggester.ts`, wraps `FuzzySuggestModal`); files are read with Node `fs.readFileSync`, converted, then written via `writeImportedFiles`.
- "Export HTML (debug)" only works in single-file mode.

**Export pipeline** (`src/exporter.ts`):
```
Active .md note (string)
  → preprocessMarkdown()   strip YAML frontmatter, ![[img]] → <img src>, [[wikilinks]] → text/remove
  → marked.parse()         custom ==highlight== token → <mark>; standard MD → HTML
  → processBlocks()        walk DOM → docx.js Paragraph / Table / ImageRun objects
  → Document + Packer      docx npm package assembles final .docx buffer
  → fs.writeFileSync       written to user-chosen path via Electron save dialog
```

Key details in `exporter.ts`:
- `preprocessMarkdown()` handles three rewrites before `marked`: strip `---` frontmatter, convert `![[path]]` image wikilinks to `<img src="path">`, and either flatten or drop `[[Note]]` wikilinks depending on `wikilinksAsPlainText`.
- `collectInlineItems()` / `renderInlineItems()` form a two-phase inline renderer: the first walks the HTML DOM recursively and accumulates an `InlineItem[]` IR (text, break, image, link); the second converts that IR to docx `TextRun`/`ExternalHyperlink`/`ImageRun` objects. This split avoids interleaving async image loading with docx object construction.
- `loadImage()` resolves wikilink-style `src` values relative to the active file's vault folder, reads binary via `app.vault.readBinary`, and parses PNG/JPEG dimensions from raw bytes so images are scaled to `IMAGE_MAX_WIDTH` (400 px) with correct aspect ratio.
- `processList()` is recursive: it separates inline text nodes from nested `<ul>`/`<ol>` children within each `<li>`, emitting a `Paragraph` with `numbering` or `bullet` at the current `level`, then recursing for nested lists.
- The single ordered-list numbering reference `ORDERED_REF` is defined once in the `Document` with 9 levels; all ordered list paragraphs reference it by level index.

**Debug export:** The modal also has an "Export HTML (debug)" button that calls `convertDocxToHtml()` (exported from `converter.ts`). It writes `raw.html` (mammoth output before DOM patching) and `fixed.html` (after `fixNestedLists()`) into the target folder without doing the full markdown conversion. Useful for diagnosing list or styling issues.

## Key constraints

- `isDesktopOnly: true` in `manifest.json` — no mobile support; Electron and Node.js APIs are safe to use.
- `electron` and all Node.js builtins are marked external in `esbuild.config.mjs` — do not import them at the top level; use `require()` inside functions so the bundle stays valid. All other dependencies (`mammoth`, `docx`, `fflate`, `turndown`, `marked`) are bundled. `fflate` is loaded via `require()` inside `extractBodyRunColors` for consistency.
- `esbuild.config.mjs` runs a post-build patch (`patchJsZipIE8Polyfill`) that removes the IE8 `onreadystatechange` script-element polyfill from JSZip's code (bundled inside both `mammoth` and `docx`). This is dead code in Electron/Chromium — `MutationObserver` is always available — but static scanners flag `createElement("script")`. If `jszip` is upgraded, verify the patch strings still match.
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