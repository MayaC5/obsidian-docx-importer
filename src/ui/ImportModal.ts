import { App, Modal, Notice, Setting, TFile, TFolder, TextComponent } from 'obsidian';
import DocxImporterPlugin from '../main';
import { FolderSuggester } from './FolderSuggester';
import { convertDocxToMarkdown, convertDocxToHtml } from '../converter';
import { writeImportedFiles } from '../fileManager';

export class ImportModal extends Modal {
	private selectedFile: { path: string; name: string } | null = null;
	private selectedFolder: TFolder | null = null;
	private folderName = '';
	private folderNameText!: TextComponent;

	constructor(app: App, _plugin: DocxImporterPlugin) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Import DOCX' });

		new Setting(contentEl)
			.setName('DOCX file')
			.setDesc('Select a .docx file to import')
			.addButton(btn => {
				btn.setButtonText('Choose file…').onClick(() => {
					const { dialog } = require('electron').remote;
					const files: string[] | undefined = dialog.showOpenDialogSync({
						properties: ['openFile'],
						filters: [{ name: 'Word Documents', extensions: ['docx'] }],
					});
					if (!files?.[0]) return;
					const filePath = files[0];
					const fileName = filePath.split(/[\\/]/).pop()!;
					this.selectedFile = { path: filePath, name: fileName };
					btn.setButtonText(fileName);
					if (!this.folderName) {
						const derived = fileName.replace(/\.docx$/i, '');
						this.folderName = derived;
						this.folderNameText.setValue(derived);
					}
				});
			});

		new Setting(contentEl)
			.setName('Note name')
			.setDesc('Subfolder and note filename')
			.addText(text => {
				this.folderNameText = text;
				text.setPlaceholder('e.g. My Document')
					.setValue(this.folderName)
					.onChange(val => { this.folderName = val; });
			});

		new Setting(contentEl)
			.setName('Parent folder')
			.setDesc('Where to create the import subfolder')
			.addButton(btn => {
				btn.setButtonText('/ (vault root)').onClick(() => {
					new FolderSuggester(this.app, folder => {
						this.selectedFolder = folder;
						btn.setButtonText(folder.isRoot() ? '/ (vault root)' : folder.path);
					}).open();
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Export HTML (debug)')
				.onClick(() => this.doExportHtml())
			)
			.addButton(btn => btn
				.setButtonText('Import')
				.setCta()
				.onClick(() => this.doImport())
			);
	}

	private async doImport() {
		if (!this.selectedFile) {
			new Notice('Please select a DOCX file.');
			return;
		}
		if (!this.folderName.trim()) {
			new Notice('Please enter a note name.');
			return;
		}

		const parent = this.selectedFolder ?? this.app.vault.getRoot();
		const targetPath = parent.isRoot()
			? this.folderName
			: `${parent.path}/${this.folderName}`;

		if (this.app.vault.getAbstractFileByPath(targetPath)) {
			new Notice(`"${targetPath}" already exists in the vault.`);
			return;
		}

		try {
			const fs = require('fs') as typeof import('fs');
			const raw = fs.readFileSync(this.selectedFile.path);
			const buffer: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

			const result = await convertDocxToMarkdown(buffer);
			await writeImportedFiles(this.app, parent, this.folderName, buffer, `${this.folderName}.docx`, result);

			const mdFile = this.app.vault.getAbstractFileByPath(`${targetPath}/${this.folderName}.md`);
			if (mdFile instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(mdFile);
			}

			this.close();
			new Notice(`Imported "${this.folderName}" successfully.`);
		} catch (err) {
			new Notice(`Import failed: ${(err as Error).message}`);
			console.error(err);
		}
	}

	private async doExportHtml() {
		if (!this.selectedFile) {
			new Notice('Please select a DOCX file.');
			return;
		}
		if (!this.folderName.trim()) {
			new Notice('Please enter a note name.');
			return;
		}

		const parent = this.selectedFolder ?? this.app.vault.getRoot();
		const targetPath = parent.isRoot() ? this.folderName : `${parent.path}/${this.folderName}`;

		try {
			const fs = require('fs') as typeof import('fs');
			const raw = fs.readFileSync(this.selectedFile.path);
			const buffer: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);

			const { rawHtml, fixedHtml } = await convertDocxToHtml(buffer);

			if (!this.app.vault.getAbstractFileByPath(targetPath)) {
				await this.app.vault.createFolder(targetPath);
			}
			await this.app.vault.create(`${targetPath}/raw.html`, rawHtml);
			await this.app.vault.create(`${targetPath}/fixed.html`, fixedHtml);

			new Notice(`HTML exported to ${targetPath}/`);
		} catch (err) {
			new Notice(`Export failed: ${(err as Error).message}`);
			console.error(err);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
