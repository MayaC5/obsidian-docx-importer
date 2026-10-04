export class TFile {
	path = '';
	extension = '';
	parent: { path: string } | null = null;
}

export interface App {
	vault: {
		getAbstractFileByPath(path: string): unknown;
		readBinary(file: TFile): Promise<ArrayBuffer>;
	};
}
