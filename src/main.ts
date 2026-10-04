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

interface SavePickerOptions {
	suggestedName?: string;
	types?: Array<{
		description: string;
		accept: Record<string, string[]>;
	}>;
}

type SaveFilePicker = (options?: SavePickerOptions) => Promise<FileSystemFileHandle>;

function isStoredSettings(value: unknown): value is Partial<PluginSettings> {
	if (value === null || typeof value !== 'object') return false;
	const settings = value as { wikilinksAsPlainText?: unknown };
	return settings.wikilinksAsPlainText === undefined || typeof settings.wikilinksAsPlainText === 'boolean';
}

async function saveDocxFile(data: ArrayBuffer, suggestedName: string): Promise<boolean> {
	const fileWindow = window as Window & { showSaveFilePicker?: SaveFilePicker };
	const blob = new Blob([data], {
		type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	});

	if (fileWindow.showSaveFilePicker) {
		try {
			const handle = await fileWindow.showSaveFilePicker({
				suggestedName,
				types: [{
					description: 'Word documents',
					accept: { [blob.type]: ['.docx'] },
				}],
			});
			const writable = await handle.createWritable();
			await writable.write(blob);
			await writable.close();
			return true;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return false;
			throw error;
		}
	}

	const url = URL.createObjectURL(blob);
	const link = document.body.createEl('a', {
		attr: { href: url, download: suggestedName },
	});
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
	return true;
}

export default class DocxImporterPlugin extends Plugin {
	settings!: PluginSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new DocxImporterSettingsTab(this.app, this));

		this.addRibbonIcon('file-up', 'Import DOCX', () => {
			new ImportModal(this.app, this).open();
		});

		this.addRibbonIcon('download', 'Export note as DOCX', () => {
			void this.exportActiveNote();
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

	async loadSettings(): Promise<void> {
		const stored: unknown = await this.loadData();
		this.settings = {
			...DEFAULT_SETTINGS,
			...(isStoredSettings(stored) ? stored : {}),
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private async exportActiveNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile || activeFile.extension !== 'md') {
			new Notice('Open a Markdown note to export.');
			return;
		}

		try {
			const markdown = await this.app.vault.read(activeFile);
			const buffer = await convertMarkdownToDocx(markdown, this.app, activeFile, this.settings);
			const saved = await saveDocxFile(buffer, `${activeFile.basename}.docx`);
			if (saved) new Notice(`Exported "${activeFile.basename}" successfully.`);
		} catch (err) {
			new Notice(`Export failed: ${(err as Error).message}`);
			console.error(err);
		}
	}
}
