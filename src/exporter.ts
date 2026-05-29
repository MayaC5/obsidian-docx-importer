import { App, TFile } from 'obsidian';
import {
	AlignmentType, BorderStyle, convertInchesToTwip, Document, ExternalHyperlink,
	HeadingLevel, ImageRun, LevelFormat, Packer, Paragraph, ShadingType,
	Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { marked } from 'marked';

export interface ExporterSettings {
	wikilinksAsPlainText: boolean;
}

// ── marked: custom ==highlight== extension ────────────────────────────────────

marked.use({
	extensions: [{
		name: 'obsidianHighlight',
		level: 'inline' as const,
		start(src: string) { return src.indexOf('=='); },
		tokenizer(src: string) {
			const match = /^==([^=\n]+)==/.exec(src);
			if (match) return { type: 'obsidianHighlight', raw: match[0], text: match[1] };
			return undefined;
		},
		renderer(token) { return `<mark>${(token as any).text}</mark>`; },
	}],
});

// ── image dimension parsing ───────────────────────────────────────────────────

const IMAGE_MAX_WIDTH = 400;

function parseDimensions(buffer: ArrayBuffer, ext: string): { width: number; height: number } {
	const view = new DataView(buffer);
	try {
		if (ext === 'png') {
			const w = view.getUint32(16, false);
			const h = view.getUint32(20, false);
			if (w > 0 && h > 0) {
				return { width: IMAGE_MAX_WIDTH, height: Math.round(h * (IMAGE_MAX_WIDTH / w)) };
			}
		} else if (ext === 'jpg' || ext === 'jpeg') {
			let offset = 2;
			while (offset < buffer.byteLength - 8) {
				if (view.getUint8(offset) !== 0xFF) break;
				const marker = view.getUint8(offset + 1);
				if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
					offset += 2;
					continue;
				}
				const segLen = view.getUint16(offset + 2, false);
				const isSOF = (marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) ||
					(marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF);
				if (isSOF && offset + 8 < buffer.byteLength) {
					const h = view.getUint16(offset + 5, false);
					const w = view.getUint16(offset + 7, false);
					if (w > 0 && h > 0) {
						return { width: IMAGE_MAX_WIDTH, height: Math.round(h * (IMAGE_MAX_WIDTH / w)) };
					}
				}
				offset += 2 + segLen;
			}
		}
	} catch { /* fallthrough to default */ }
	return { width: IMAGE_MAX_WIDTH, height: Math.round(IMAGE_MAX_WIDTH * 0.75) };
}

type ImgType = 'jpg' | 'png' | 'gif' | 'bmp';
const SUPPORTED_IMG_TYPES: Record<string, ImgType> = { jpg: 'jpg', jpeg: 'jpg', png: 'png', gif: 'gif', bmp: 'bmp' };

async function loadImage(app: App, activeFile: TFile, src: string) {
	const folderPath = activeFile.parent?.path ?? '';
	const vaultPath = folderPath ? `${folderPath}/${src}` : src;
	const file = app.vault.getAbstractFileByPath(vaultPath);
	if (!(file instanceof TFile)) return null;
	const type = SUPPORTED_IMG_TYPES[file.extension.toLowerCase()];
	if (!type) return null;
	const data = await app.vault.readBinary(file);
	return { data, type, ...parseDimensions(data, file.extension.toLowerCase()) };
}

// ── inline item intermediate representation ───────────────────────────────────

interface InlineFmt {
	bold?: boolean;
	italics?: boolean;
	highlight?: string;
	color?: string;
	code?: boolean;
	strike?: boolean;
}

type InlineItem =
	| { kind: 'text'; text: string; fmt: InlineFmt }
	| { kind: 'break' }
	| { kind: 'image'; run: ImageRun }
	| { kind: 'link'; href: string; items: InlineItem[] };

async function collectInlineItems(
	node: Node,
	fmt: InlineFmt,
	app: App,
	activeFile: TFile,
): Promise<InlineItem[]> {
	const out: InlineItem[] = [];

	if (node.nodeType === Node.TEXT_NODE) {
		const text = node.textContent ?? '';
		if (text) out.push({ kind: 'text', text, fmt });
		return out;
	}
	if (node.nodeType !== Node.ELEMENT_NODE) return out;

	const el = node as Element;
	const tag = el.tagName.toUpperCase();

	if (tag === 'BR') return [{ kind: 'break' }];

	if (tag === 'IMG') {
		const src = el.getAttribute('src') ?? '';
		const img = await loadImage(app, activeFile, src);
		if (img) out.push({ kind: 'image', run: new ImageRun({ type: img.type, data: Buffer.from(img.data), transformation: { width: img.width, height: img.height } }) });
		return out;
	}

	if (tag === 'A') {
		const href = el.getAttribute('href') ?? '';
		const children: InlineItem[] = [];
		for (const child of Array.from(el.childNodes)) {
			children.push(...await collectInlineItems(child, fmt, app, activeFile));
		}
		if (href) {
			out.push({ kind: 'link', href, items: children });
		} else {
			out.push(...children);
		}
		return out;
	}

	const next: InlineFmt = { ...fmt };
	if (tag === 'STRONG' || tag === 'B') next.bold = true;
	if (tag === 'EM' || tag === 'I') next.italics = true;
	if (tag === 'MARK') next.highlight = 'yellow';
	if (tag === 'CODE') next.code = true;
	if (tag === 'S' || tag === 'DEL') next.strike = true;
	if (tag === 'SPAN') {
		const m = /color:\s*#?([0-9A-Fa-f]{6})/.exec(el.getAttribute('style') ?? '');
		if (m) next.color = m[1].toUpperCase();
	}

	for (const child of Array.from(el.childNodes)) {
		out.push(...await collectInlineItems(child, next, app, activeFile));
	}
	return out;
}

function renderInlineItems(items: InlineItem[]): (TextRun | ExternalHyperlink | ImageRun)[] {
	const out: (TextRun | ExternalHyperlink | ImageRun)[] = [];
	for (const item of items) {
		if (item.kind === 'text') {
			out.push(new TextRun({
				text: item.text,
				bold: item.fmt.bold,
				italics: item.fmt.italics,
				highlight: item.fmt.highlight as 'yellow' | undefined,
				color: item.fmt.color,
				strike: item.fmt.strike,
				font: item.fmt.code ? 'Courier New' : undefined,
				size: item.fmt.code ? 18 : undefined,
			}));
		} else if (item.kind === 'break') {
			out.push(new TextRun({ text: '', break: 1 }));
		} else if (item.kind === 'image') {
			out.push(item.run);
		} else if (item.kind === 'link') {
			const runs: TextRun[] = [];
			for (const child of item.items) {
				if (child.kind === 'text' && child.text) {
					runs.push(new TextRun({
						text: child.text,
						bold: child.fmt.bold,
						italics: child.fmt.italics,
						color: child.fmt.color,
						strike: child.fmt.strike,
						style: 'Hyperlink',
					}));
				}
			}
			if (runs.length > 0) {
				out.push(new ExternalHyperlink({ children: runs, link: item.href }));
			}
		}
	}
	return out;
}

async function inlinesOf(
	el: Element,
	fmt: InlineFmt,
	app: App,
	activeFile: TFile,
): Promise<(TextRun | ExternalHyperlink | ImageRun)[]> {
	const items: InlineItem[] = [];
	for (const child of Array.from(el.childNodes)) {
		items.push(...await collectInlineItems(child, fmt, app, activeFile));
	}
	return renderInlineItems(items);
}

// ── list processing ───────────────────────────────────────────────────────────

const ORDERED_REF = 'docx-importer-ordered';

async function processList(
	listEl: Element,
	level: number,
	ordered: boolean,
	app: App,
	activeFile: TFile,
): Promise<Paragraph[]> {
	const out: Paragraph[] = [];
	for (const child of Array.from(listEl.children)) {
		if (child.tagName.toUpperCase() !== 'LI') continue;

		// Separate inline content from nested lists
		const inlineNodes: Node[] = [];
		const nestedLists: Element[] = [];
		for (const n of Array.from(child.childNodes)) {
			if (n.nodeType === Node.ELEMENT_NODE) {
				const t = (n as Element).tagName.toUpperCase();
				if (t === 'UL' || t === 'OL') {
					nestedLists.push(n as Element);
					continue;
				}
			}
			inlineNodes.push(n);
		}

		const items: InlineItem[] = [];
		for (const n of inlineNodes) {
			items.push(...await collectInlineItems(n, {}, app, activeFile));
		}

		out.push(new Paragraph({
			children: renderInlineItems(items),
			...(ordered
				? { numbering: { reference: ORDERED_REF, level } }
				: { bullet: { level } }),
		}));

		for (const nested of nestedLists) {
			out.push(...await processList(
				nested,
				level + 1,
				nested.tagName.toUpperCase() === 'OL',
				app,
				activeFile,
			));
		}
	}
	return out;
}

// ── table processing ──────────────────────────────────────────────────────────

async function processTable(
	tableEl: Element,
	app: App,
	activeFile: TFile,
): Promise<Table> {
	const rows: TableRow[] = [];

	for (const tr of Array.from(tableEl.querySelectorAll('thead tr, tbody tr'))) {
		const cells = await Promise.all(
			Array.from(tr.querySelectorAll('th, td')).map(async cell => {
				const isHeader = cell.tagName.toUpperCase() === 'TH';
				const children = await inlinesOf(cell, { bold: isHeader || undefined }, app, activeFile);
				return new TableCell({ children: [new Paragraph({ children })] });
			})
		);
		rows.push(new TableRow({ children: cells }));
	}

	return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

// ── block processing ──────────────────────────────────────────────────────────

const HEADING_LEVELS = [
	HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3,
	HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6,
];

async function processBlocks(
	container: Element,
	app: App,
	activeFile: TFile,
): Promise<(Paragraph | Table)[]> {
	const out: (Paragraph | Table)[] = [];

	for (const child of Array.from(container.childNodes)) {
		if (child.nodeType !== Node.ELEMENT_NODE) continue;
		const el = child as Element;
		const tag = el.tagName.toUpperCase();

		if (tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'H4' || tag === 'H5' || tag === 'H6') {
			out.push(new Paragraph({
				heading: HEADING_LEVELS[parseInt(tag[1]) - 1],
				children: await inlinesOf(el, {}, app, activeFile),
			}));

		} else if (tag === 'P') {
			out.push(new Paragraph({ children: await inlinesOf(el, {}, app, activeFile) }));

		} else if (tag === 'UL' || tag === 'OL') {
			out.push(...await processList(el, 0, tag === 'OL', app, activeFile));

		} else if (tag === 'BLOCKQUOTE') {
			for (const inner of Array.from(el.childNodes)) {
				if (inner.nodeType !== Node.ELEMENT_NODE) continue;
				const innerEl = inner as Element;
				out.push(new Paragraph({
					children: await inlinesOf(innerEl, {}, app, activeFile),
					indent: { left: convertInchesToTwip(0.5) },
					border: { left: { style: BorderStyle.SINGLE, size: 20, color: 'CCCCCC', space: 1 } },
				}));
			}

		} else if (tag === 'PRE') {
			const codeEl = el.querySelector('code');
			const lines = (codeEl?.textContent ?? el.textContent ?? '').split('\n');
			// Drop trailing blank line that split() adds for a trailing \n
			if (lines.at(-1) === '') lines.pop();
			for (const line of lines) {
				out.push(new Paragraph({
					children: [new TextRun({ text: line, font: 'Courier New', size: 18 })],
					shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F5F5F5' },
				}));
			}

		} else if (tag === 'HR') {
			out.push(new Paragraph({ thematicBreak: true }));

		} else if (tag === 'TABLE') {
			out.push(await processTable(el, app, activeFile));
		}
	}

	return out;
}

// ── preprocessing ─────────────────────────────────────────────────────────────

function preprocessMarkdown(markdown: string, settings: ExporterSettings): string {
	// Strip YAML frontmatter
	let md = markdown.replace(/^---[\r\n][\s\S]*?[\r\n]---[\r\n]?/, '');

	// ![[path]] → <img src="path"> (image wikilinks)
	md = md.replace(/!\[\[([^\]]+)\]\]/g, (_, path) => `<img src="${path}">`);

	// [[Note|Alias]] or [[Note]] → plain text or remove
	if (settings.wikilinksAsPlainText) {
		md = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, note, alias) => alias ?? note);
	} else {
		md = md.replace(/\[\[[^\]]*\]\]/g, '');
	}

	return md;
}

// ── public API ────────────────────────────────────────────────────────────────

export async function convertMarkdownToDocx(
	markdown: string,
	app: App,
	activeFile: TFile,
	settings: ExporterSettings,
): Promise<ArrayBuffer> {
	const preprocessed = preprocessMarkdown(markdown, settings);
	const html = marked.parse(preprocessed) as string;

	const container = document.createElement('div');
	container.innerHTML = html;

	const children = await processBlocks(container, app, activeFile);
	if (children.length === 0) children.push(new Paragraph({}));

	const doc = new Document({
		numbering: {
			config: [{
				reference: ORDERED_REF,
				levels: Array.from({ length: 9 }, (_, i) => ({
					level: i,
					format: LevelFormat.DECIMAL,
					text: `%${i + 1}.`,
					alignment: AlignmentType.START,
					style: {
						paragraph: {
							indent: {
								left: convertInchesToTwip(0.25 * (i + 1)),
								hanging: convertInchesToTwip(0.25),
							},
						},
					},
				})),
			}],
		},
		sections: [{ children }],
	});

	const buf = await Packer.toBuffer(doc);
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
