import { App, PluginSettingTab, Setting } from 'obsidian';
import DocxImporterPlugin from '../main';

export class DocxImporterSettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: DocxImporterPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Non-attachment wikilinks')
			.setDesc('How to handle [[Note Name]] links (not image attachments) when exporting to DOCX.')
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
