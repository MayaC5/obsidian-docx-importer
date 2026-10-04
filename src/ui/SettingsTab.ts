import { App, PluginSettingTab, Setting } from 'obsidian';
import DocxImporterPlugin from '../main';

export class DocxImporterSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: DocxImporterPlugin) {
		super(app, plugin);
	}

	getSettingDefinitions() {
		return [{
			name: 'Keep non-attachment wikilinks',
			desc: 'Export [[Note Name]] links as plain text. When disabled, these links are removed.',
			control: {
				type: 'toggle',
				key: 'wikilinksAsPlainText',
			},
		}];
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Non-attachment wikilinks')
			.setDesc('How to handle [[note name]] links (not image attachments) when exporting to DOCX.')
			.addDropdown(drop => drop
				.addOption('plaintext', 'Plain text')
				.addOption('skip', 'Skip (remove)')
				.setValue(this.plugin.settings.wikilinksAsPlainText ? 'plaintext' : 'skip')
				.onChange(async val => {
					this.plugin.settings.wikilinksAsPlainText = val === 'plaintext';
					await this.plugin.saveSettings();
				})
			);
	}
}
