import { App, FuzzySuggestModal, TFolder } from 'obsidian';

export class FolderSuggester extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder('Select a parent folder...');
	}

	getItems(): TFolder[] {
		return [this.app.vault.getRoot(), ...this.app.vault.getAllFolders()];
	}

	getItemText(folder: TFolder): string {
		return folder.isRoot() ? '/ (vault root)' : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
