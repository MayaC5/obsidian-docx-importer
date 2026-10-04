import { Document, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';

import { convertDocxToMarkdown } from './converter';

async function packDocx(paragraphs: Paragraph[]): Promise<ArrayBuffer> {
	const document = new Document({
		sections: [
			{
				children: paragraphs,
			},
		],
	});
	const buffer = await Packer.toBuffer(document);
	const arrayBuffer = new ArrayBuffer(buffer.byteLength);
	new Uint8Array(arrayBuffer).set(buffer);
	return arrayBuffer;
}

function docxWithParagraphs(paragraphs: string[]): Promise<ArrayBuffer> {
	return packDocx(paragraphs.map(text => new Paragraph(text)));
}

describe('convertDocxToMarkdown', () => {
	it('keeps ordinary paragraphs and returns no images for a text-only document', async () => {
		const input = await docxWithParagraphs(['First paragraph', 'Second paragraph']);

		const result = await convertDocxToMarkdown(input);

		expect(result).toEqual({
			markdown: 'First paragraph\n\nSecond paragraph',
			images: [],
		});
	});

	it('escapes angle-bracket placeholders so Obsidian renders them as text', async () => {
		const input = await docxWithParagraphs([
			'The device naming convention is:',
			'<area> <object>',
			'<area> <object> <device function>',
			'<area> <device function>',
		]);

		const result = await convertDocxToMarkdown(input);

		expect(result.markdown).toBe([
			'The device naming convention is:',
			'',
			'\\<area> \\<object>',
			'',
			'\\<area> \\<object> \\<device function>',
			'',
			'\\<area> \\<device function>',
		].join('\n'));
		expect(result.images).toEqual([]);
	});

	it('preserves generated HTML while escaping angle brackets in its text', async () => {
		const input = await packDocx([
			new Paragraph({
				children: [new TextRun({ text: '<area>', color: 'FF0000' })],
			}),
		]);

		const result = await convertDocxToMarkdown(input);

		expect(result.markdown).toBe('<span style="color: #FF0000">\\<area></span>');
	});
});
