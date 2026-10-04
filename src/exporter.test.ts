import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { convertDocxToMarkdown } from './converter';
import { convertMarkdownToDocx } from './exporter';

const appWithoutImages = {
	vault: {
		getAbstractFileByPath: () => null,
		readBinary: async () => new ArrayBuffer(0),
	},
};

const activeFile = { parent: null };
const settings = { wikilinksAsPlainText: true };

function localArrayBuffer(source: ArrayBuffer): ArrayBuffer {
	const copy = new ArrayBuffer(source.byteLength);
	new Uint8Array(copy).set(new Uint8Array(source));
	return copy;
}

async function documentXml(source: ArrayBuffer): Promise<string> {
	const zip = await JSZip.loadAsync(new Uint8Array(source));
	return await zip.file('word/document.xml')!.async('text');
}

async function visibleText(source: ArrayBuffer): Promise<string> {
	const xml = await documentXml(source);
	const document = new DOMParser().parseFromString(xml, 'text/xml');
	return Array.from(document.getElementsByTagNameNS(
		'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
		't',
	), node => node.textContent ?? '').join('');
}

describe('DOCX round trip', () => {
	it('preserves escaped angle-bracket placeholders', async () => {
		const markdown = [
			'The device naming convention is:',
			'',
			'\\<area> \\<object>',
			'',
			'\\<area> \\<object> \\<device function>',
			'',
			'\\<area> \\<device function>',
		].join('\n');

		const docx = await convertMarkdownToDocx(
			markdown,
			appWithoutImages as never,
			activeFile as never,
			settings,
		);
		const result = await convertDocxToMarkdown(localArrayBuffer(docx));

		expect(result.markdown).toBe(markdown);
	});

	it('recovers unescaped placeholders from notes imported before the fix', async () => {
		const markdown = [
			'The device naming convention is:',
			'',
			'<area> <object>',
			'',
			'<area> <object> <device function>',
			'',
			'<area> <device function>',
		].join('\n');

		const docx = await convertMarkdownToDocx(
			markdown,
			appWithoutImages as never,
			activeFile as never,
			settings,
		);
		const result = await convertDocxToMarkdown(localArrayBuffer(docx));

		expect(result.markdown).toBe(markdown.replace(/</g, '\\<'));
	});

	it('leaves paired HTML and angle brackets in code unchanged', async () => {
		const markdown = [
			'Paired <span style="color: #FF0000">HTML</span>',
			'',
			'Inline `<code value>`',
			'',
			'```',
			'<block value>',
			'```',
		].join('\n');

		const docx = await convertMarkdownToDocx(
			markdown,
			appWithoutImages as never,
			activeFile as never,
			settings,
		);

		const text = await visibleText(docx);
		expect(text).toContain('Paired HTML');
		expect(text).toContain('Inline <code value>');
		expect(text).toContain('<block value>');
		expect(text).not.toContain('\\<');
	});

	it('retains heading, list, and highlight formatting', async () => {
		const markdown = '# Heading\n\n- First\n- Second\n\n==Highlighted==';

		const docx = await convertMarkdownToDocx(
			markdown,
			appWithoutImages as never,
			activeFile as never,
			settings,
		);
		const xml = await documentXml(docx);

		expect(await visibleText(docx)).toContain('HeadingFirstSecondHighlighted');
		expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
		expect(xml).toContain('<w:numPr>');
		expect(xml).toContain('<w:highlight w:val="yellow"/>');
	});
});
