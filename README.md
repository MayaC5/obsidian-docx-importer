# DOCX Importer

An [Obsidian](https://obsidian.md) desktop plugin to import `.docx` files into your vault as Markdown, and export Markdown notes back to `.docx`.

Creator Note:
At first, I was trying to import my google doc notes to my vault. I found that even if google doc do have export to markdown file, some of the style and format could not be kept, so this idea has came.

## Features

### Import (DOCX → Markdown)
- **Batch import** — select multiple `.docx` files at once; each gets its own subfolder with an editable name and real-time conflict detection
- Creates a subfolder containing the converted `.md` note, a copy of the original `.docx`, and an `attachments/` folder for extracted images
- Preserves: headings, bold, italic, strikethrough, highlights, text color, hyperlinks, ordered and nested lists, tables, blockquotes, inline code, fenced code blocks
- Images are saved as vault attachments and linked with Obsidian wikilink syntax (`![[attachments/image1.png]]`)

### Export (Markdown → DOCX)
- Exports the currently active note via **ribbon icon** or **command palette** (`Export active note as DOCX`)
- Prompts for a save location via a system dialog
- Preserves: headings, bold, italic, strikethrough, highlights, hyperlinks, ordered and nested lists, tables, blockquotes, code blocks, and images embedded from the vault

### Demo
1. Batch Import
[Screencast From 2026-05-29 18-18-15.webm](https://github.com/user-attachments/assets/99d5ef64-0396-429d-abb2-a677db555af0)

2. Single Import
[Screencast From 2026-05-29 18-24-57.webm](https://github.com/user-attachments/assets/7df5c6e6-854b-4294-8123-294f58f589a4)


## Installation

### From Obsidian Community Plugins
NOTE: This plugin is yet to approve by administrator manually, please consider using manual installation first
1. Open **Settings → Community plugins → Browse**
2. Search for **DOCX Importer**
3. Click **Install**, then **Enable**

### Manual
1. Download `main.js`, `styles.css`, and `manifest.json` from the [latest release](../../releases/latest)
2. Copy all three files to `<vault>/.obsidian/plugins/docx-importer/`
3. Enable the plugin in **Settings → Community plugins**

## Usage

### Import
1. Click the **file-up** ribbon icon, or run **Import DOCX file** from the command palette
2. Pick one or more `.docx` files (hold **Ctrl** or **Shift** to select multiple)
3. For each file, edit the subfolder name if needed — conflicts are flagged in real time
4. Choose a parent folder, then click **Import**
5. The first converted note opens automatically

### Export
1. Open the Markdown note you want to export
2. Click the **download** ribbon icon, or run **Export active note as DOCX** from the command palette
3. Choose where to save the `.docx` file

## Settings

| Setting | Description |
|---|---|
| Non-attachment wikilinks | Controls how `[[Note Name]]` links are handled during export: **Plain text** (keep the note name) or **Skip** (remove entirely) |

## Limitations

- Desktop only — requires Obsidian's desktop app
- Text color in footnotes and endnotes is not preserved on import
- Theme-based (non-hex) colors in DOCX are not preserved on import
