import { App, Modal, Notice, Setting, TFile, TFolder, TextComponent } from 'obsidian';
import DocxImporterPlugin from '../main';
import { FolderSuggester } from './FolderSuggester';
import { convertDocxToMarkdown, convertDocxToHtml } from '../converter';
import { writeImportedFiles } from '../fileManager';

interface SelectedFile {
	path: string;
	name: string;
	folderName: string;
}

export class ImportModal extends Modal {
	private selectedFiles: SelectedFile[] = [];
	private selectedFolder: TFolder | null = null;
	private folderName = '';
	private folderNameText!: TextComponent;
	private noteNameSetting!: Setting;
	private fileListEl!: HTMLElement;

	constructor(app: App, _plugin: DocxImporterPlugin) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Import DOCX' });

		new Setting(contentEl)
			.setName('DOCX file')
			.setDesc('Select one or more .docx files to import')
			.addButton(btn => {
				btn.setButtonText('Choose file…').onClick(async () => {
					const { dialog } = require('electron').remote;
					const result = await dialog.showOpenDialog({
						properties: ['openFile', 'multiSelections'],
						filters: [{ name: 'Word Documents', extensions: ['docx'] }],
					});
					if (result.canceled || !result.filePaths.length) return;

					this.selectedFiles = result.filePaths.map((filePath: string) => {
						const name = filePath.split(/[\\/]/).pop()!;
						const folderName = name.replace(/\.docx$/i, '');
						return { path: filePath, name, folderName };
					});

					if (this.selectedFiles.length === 1) {
						btn.setButtonText(this.selectedFiles[0].name);
						if (!this.folderName) {
							this.folderName = this.selectedFiles[0].folderName;
							this.folderNameText.setValue(this.folderName);
						}
						this.noteNameSetting.settingEl.show();
						this.fileListEl.empty();
					} else {
						btn.setButtonText(`${this.selectedFiles.length} files selected`);
						this.noteNameSetting.settingEl.hide();
						this.renderFileList();
					}
				});
			});

		this.noteNameSetting = new Setting(contentEl)
			.setName('Note name')
			.setDesc('Subfolder and note filename')
			.addText(text => {
				this.folderNameText = text;
				text.setPlaceholder('e.g. My Document')
					.setValue(this.folderName)
					.onChange(val => { this.folderName = val; });
			});

		this.fileListEl = contentEl.createDiv({ cls: 'docx-batch-list' });

		new Setting(contentEl)
			.setName('Parent folder')
			.setDesc('Where to create the import subfolder(s)')
			.addButton(btn => {
				btn.setButtonText('/ (vault root)').onClick(() => {
					new FolderSuggester(this.app, folder => {
						this.selectedFolder = folder;
						btn.setButtonText(folder.isRoot() ? '/ (vault root)' : folder.path);
						if (this.selectedFiles.length > 1) this.renderFileList();
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
				.onClick(() => {
					if (this.selectedFiles.length > 1) {
						this.doBatchImport();
					} else {
						this.doImport();
					}
				})
			);
	}

	private getTargetPath(folderName: string): string {
		const parent = this.selectedFolder ?? this.app.vault.getRoot();
		return parent.isRoot() ? folderName : `${parent.path}/${folderName}`;
	}

	private renderFileList() {
		this.fileListEl.empty();

		const header = this.fileListEl.createDiv({ cls: 'docx-batch-row docx-batch-header' });
		header.createEl('span', { text: 'File', cls: 'docx-batch-filename' });
		header.createEl('span', { text: 'Note name', cls: 'docx-batch-label' });

		for (const file of this.selectedFiles) {
			const row = this.fileListEl.createDiv({ cls: 'docx-batch-row' });
			row.createEl('span', { text: file.name, cls: 'docx-batch-filename' });

			const input = row.createEl('input', { type: 'text', value: file.folderName });
			input.addClass('docx-batch-name-input');

			const conflict = row.createEl('span', { cls: 'docx-batch-conflict' });

			const check = () => {
				file.folderName = input.value.trim();
				const exists = !!file.folderName && !!this.app.vault.getAbstractFileByPath(this.getTargetPath(file.folderName));
				conflict.setText(exists ? '⚠ Already exists' : '');
				conflict.toggleClass('mod-warning', exists);
			};

			input.addEventListener('input', check);
			check();
		}
	}

	private async doImport() {
		if (!this.selectedFiles.length) {
			new Notice('Please select a DOCX file.');
			return;
		}
		if (!this.folderName.trim()) {
			new Notice('Please enter a note name.');
			return;
		}

		const parent = this.selectedFolder ?? this.app.vault.getRoot();
		const targetPath = this.getTargetPath(this.folderName);

		if (this.app.vault.getAbstractFileByPath(targetPath)) {
			new Notice(`"${targetPath}" already exists in the vault.`);
			return;
		}

		try {
			const fs = require('fs') as typeof import('fs');
			const raw = fs.readFileSync(this.selectedFiles[0].path);
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

	private async doBatchImport() {
		const parent = this.selectedFolder ?? this.app.vault.getRoot();
		const fs = require('fs') as typeof import('fs');
		let firstMd: TFile | null = null;
		let successCount = 0;
		let errorCount = 0;

		for (const file of this.selectedFiles) {
			const name = file.folderName.trim();
			if (!name) {
				new Notice(`Skipped "${file.name}": note name is empty.`);
				errorCount++;
				continue;
			}

			const targetPath = this.getTargetPath(name);
			if (this.app.vault.getAbstractFileByPath(targetPath)) {
				new Notice(`Skipped "${file.name}": "${targetPath}" already exists.`);
				errorCount++;
				continue;
			}

			try {
				const raw = fs.readFileSync(file.path);
				const buffer: ArrayBuffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
				const result = await convertDocxToMarkdown(buffer);
				await writeImportedFiles(this.app, parent, name, buffer, `${name}.docx`, result);

				if (!firstMd) {
					const mdFile = this.app.vault.getAbstractFileByPath(`${targetPath}/${name}.md`);
					if (mdFile instanceof TFile) firstMd = mdFile;
				}
				successCount++;
			} catch (err) {
				new Notice(`Failed to import "${file.name}": ${(err as Error).message}`);
				console.error(err);
				errorCount++;
			}
		}

		if (firstMd) await this.app.workspace.getLeaf(false).openFile(firstMd);

		this.close();
		new Notice(
			errorCount === 0
				? `Imported ${successCount} file${successCount !== 1 ? 's' : ''} successfully.`
				: `Imported ${successCount}, failed ${errorCount}.`
		);
	}

	private async doExportHtml() {
		if (!this.selectedFiles.length) {
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
			const raw = fs.readFileSync(this.selectedFiles[0].path);
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
