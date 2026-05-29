import { App, TFolder } from 'obsidian';
import { ConversionResult } from './converter';

export async function writeImportedFiles(
	app: App,
	parentFolder: TFolder,
	folderName: string,
	docxBuffer: ArrayBuffer,
	docxFilename: string,
	result: ConversionResult
): Promise<void> {
	const folderPath = parentFolder.isRoot()
		? folderName
		: `${parentFolder.path}/${folderName}`;

	await app.vault.createFolder(folderPath);
	await app.vault.create(`${folderPath}/${folderName}.md`, result.markdown);
	await app.vault.createBinary(`${folderPath}/${docxFilename}`, docxBuffer);

	if (result.images.length > 0) {
		const attachmentsPath = `${folderPath}/attachments`;
		await app.vault.createFolder(attachmentsPath);
		for (const image of result.images) {
			await app.vault.createBinary(`${attachmentsPath}/${image.filename}`, image.data);
		}
	}
}
