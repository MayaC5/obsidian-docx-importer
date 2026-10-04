import { App, FuzzySuggestModal, TFolder } from 'obsidian';

export class FolderSuggester extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Select a parent folder...');
	}

	getItems(): TFolder[] {
		const folders = this.app.vault.getAllLoadedFiles().filter(
			(file): file is TFolder => file instanceof TFolder && !file.isRoot(),
		);
		return [this.app.vault.getRoot(), ...folders];
	}

	getItemText(folder: TFolder): string {
		return folder.isRoot() ? '/ (vault root)' : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
