import { Notice, Plugin } from 'obsidian';
import { ImportModal } from './ui/ImportModal';
import { DocxImporterSettingsTab } from './ui/SettingsTab';
import { convertMarkdownToDocx } from './exporter';

export interface PluginSettings {
	wikilinksAsPlainText: boolean;
}

const DEFAULT_SETTINGS: PluginSettings = {
	wikilinksAsPlainText: true,
};

export default class DocxImporterPlugin extends Plugin {
	settings!: PluginSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new DocxImporterSettingsTab(this.app, this));

		this.addRibbonIcon('file-up', 'Import DOCX', () => {
			new ImportModal(this.app, this).open();
		});

		this.addRibbonIcon('download', 'Export note as DOCX', () => {
			this.exportActiveNote();
		});

		this.addCommand({
			id: 'import-docx',
			name: 'Import DOCX file',
			callback: () => new ImportModal(this.app, this).open(),
		});

		this.addCommand({
			id: 'export-docx',
			name: 'Export active note as DOCX',
			callback: () => this.exportActiveNote(),
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private async exportActiveNote() {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('Open a markdown note to export.');
			return;
		}

		const { dialog } = require('electron').remote;
		const outputPath: string | undefined = dialog.showSaveDialogSync({
			defaultPath: activeFile.basename + '.docx',
			filters: [{ name: 'Word Documents', extensions: ['docx'] }],
		});
		if (!outputPath) return;

		try {
			const markdown = await this.app.vault.read(activeFile);
			const buffer = await convertMarkdownToDocx(markdown, this.app, activeFile, this.settings);
			const fs = require('fs') as typeof import('fs');
			fs.writeFileSync(outputPath, Buffer.from(buffer));
			new Notice(`Exported "${activeFile.basename}" successfully.`);
		} catch (err) {
			new Notice(`Export failed: ${(err as Error).message}`);
			console.error(err);
		}
	}
}
