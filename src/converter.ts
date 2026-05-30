import TurndownService from 'turndown';
import mammoth from 'mammoth';

export interface ConvertedImage {
	filename: string;
	data: ArrayBuffer;
	mimeType: string;
}

export interface ConversionResult {
	markdown: string;
	images: ConvertedImage[];
}

function fixNestedLists(html: string): string {
	const div = new DOMParser().parseFromString(html, 'text/html').body;

	// Pass 1: list emitted as direct child of another list instead of inside <li>
	div.querySelectorAll('ol > ol, ol > ul, ul > ol, ul > ul').forEach(nested => {
		const prev = nested.previousElementSibling;
		if (prev?.tagName === 'LI') prev.appendChild(nested);
	});

	const isListEl = (el: Element) => el.tagName === 'OL' || el.tagName === 'UL';
	// Use replace rather than trim:   is &nbsp; which Word puts in "empty" paragraphs
	// and trim() does not strip it, causing the empty-para detection to silently fail.
	const isEmptyPara = (el: Element) =>
		el.tagName === 'P' && (el.textContent ?? '').replace(/[\s ]/g, '') === '';

	// Pass 2: merge consecutive sibling lists separated only by empty <p> elements.
	// Word inserts blank paragraphs when list style changes, and uses separate numIds
	// per list type, causing mammoth to emit sibling <ol>/<ul> instead of nested ones.
	// Right-to-left order resolves deeper nesting before shallower in one pass.
	// Applied to both the top-level container and every <li> to cover partial nesting.
	const mergeInContainer = (container: Element) => {
		const kids = Array.from(container.children);
		for (let i = kids.length - 1; i > 0; i--) {
			const cur = kids[i];
			if (!isListEl(cur)) continue;
			let j = i - 1;
			const emptyPs: Element[] = [];
			while (j >= 0 && isEmptyPara(kids[j])) emptyPs.push(kids[j--]);
			if (j < 0 || !isListEl(kids[j])) continue;
			emptyPs.forEach(p => p.remove());
			const lastLi = kids[j].querySelector(':scope > li:last-child');
			if (lastLi) lastLi.appendChild(cur);
		}
	};

	mergeInContainer(div);
	div.querySelectorAll('li').forEach(li => mergeInContainer(li));

	return div.innerHTML;
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

// Returns one entry per <w:r> in <w:body> (document order): the hex color string
// (e.g. "FF0000") or null if the run has no explicit non-black color.
async function extractBodyRunColors(buffer: ArrayBuffer): Promise<(string | null)[]> {
	try {
		const JSZip = require('jszip') as typeof import('jszip');
		const zip = await JSZip.loadAsync(new Uint8Array(buffer));
		const xmlFile = zip.file('word/document.xml');
		if (!xmlFile) return [];

		const xmlStr = await xmlFile.async('text');
		const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');

		const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
		if (!body) return [];

		const colors: (string | null)[] = [];
		for (const run of Array.from(body.getElementsByTagNameNS(W_NS, 'r'))) {
			const rPr = run.getElementsByTagNameNS(W_NS, 'rPr')[0];
			let color: string | null = null;
			if (rPr) {
				const colorEl = rPr.getElementsByTagNameNS(W_NS, 'color')[0];
				if (colorEl) {
					// w:val is in the w: namespace; try both access forms for safety
					const val =
						colorEl.getAttributeNS(W_NS, 'val') ||
						colorEl.getAttribute('w:val');
					if (val && val.toLowerCase() !== 'auto' && val.toUpperCase() !== '000000') {
						color = val.toUpperCase();
					}
				}
			}
			colors.push(color);
		}
		return colors;
	} catch {
		return [];
	}
}

const BASE_STYLE_MAP = [
	"p[numbering-level='0'][numbering-is-ordered] => ol > li:fresh",
	"p[numbering-level='0'][not numbering-is-ordered] => ul > li:fresh",
	"p[numbering-level='1'][numbering-is-ordered] => ol > li > ol > li:fresh",
	"p[numbering-level='1'][not numbering-is-ordered] => ol > li > ul > li:fresh",
	"p[numbering-level='2'][numbering-is-ordered] => ol > li > ol > li > ol > li:fresh",
	"p[numbering-level='2'][not numbering-is-ordered] => ol > li > ul > li > ul > li:fresh",
	"highlight => mark",
];

function buildTurndownService(): TurndownService {
	const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });

	td.addRule('highlight', {
		filter: ['mark'],
		replacement: (content) => `==${content}==`,
	});

	// Preserve color spans as HTML — Obsidian renders inline HTML in markdown.
	td.addRule('coloredSpan', {
		filter: (node: Node) => {
			if (node.nodeName !== 'SPAN') return false;
			const style = (node as HTMLElement).getAttribute('style') ?? '';
			return style.includes('color:');
		},
		replacement: (content: string, node: Node) => {
			const style = (node as HTMLElement).getAttribute('style');
			return `<span style="${style}">${content}</span>`;
		},
	});

	return td;
}

export interface HtmlDebugResult {
	rawHtml: string;
	fixedHtml: string;
}

export async function convertDocxToHtml(buffer: ArrayBuffer): Promise<HtmlDebugResult> {
	const result = await mammoth.convertToHtml(
		{ arrayBuffer: buffer },
		{
			styleMap: BASE_STYLE_MAP,
			convertImage: mammoth.images.imgElement(async () => ({ src: 'image-skipped' })),
		}
	);
	const rawHtml = result.value as string;
	return { rawHtml, fixedHtml: fixNestedLists(rawHtml) };
}

export async function convertDocxToMarkdown(buffer: ArrayBuffer): Promise<ConversionResult> {

	const images: ConvertedImage[] = [];
	let imageCounter = 0;

	// Parse raw XML first to collect per-run color info (mammoth drops w:color).
	const runColors = await extractBodyRunColors(buffer);
	const uniqueColors = [...new Set(runColors.filter((c): c is string => c !== null))];

	// One styleMap entry per unique color: match the fake styleName we inject below.
	const colorStyleMap = uniqueColors.map(
		hex => `r[style-name='color-${hex}'] => span[style='color: #${hex}']`
	);

	// Counter to correlate mammoth's run traversal with the runColors index array.
	// transforms.run() visits body runs in document order, matching our XML walk.
	let runIndex = 0;
	const transforms = (mammoth as any).transforms as {
		run: (fn: (run: any) => any) => (doc: any) => any;
	};

	const result = await mammoth.convertToHtml(
		{ arrayBuffer: buffer },
		{
			styleMap: [...BASE_STYLE_MAP, ...colorStyleMap],
			transformDocument: transforms.run((run: any) => {
				const color = runColors[runIndex];
				runIndex++;
				if (!color) return run;
				return { ...run, styleId: `color-${color}`, styleName: `color-${color}` };
			}),
			convertImage: mammoth.images.imgElement(async (image: {
				contentType: string;
				read(): Promise<Buffer>;
			}) => {
				imageCounter++;
				const ext = image.contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
				const filename = `image${imageCounter}.${ext}`;
				const raw = await image.read();
				images.push({
					filename,
					data: raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer,
					mimeType: image.contentType,
				});
				return { src: `attachments/${filename}` };
			}),
		}
	);

	const td = buildTurndownService();
	let markdown = td.turndown(fixNestedLists(result.value as string));

	// Convert standard markdown image links to Obsidian wikilinks
	markdown = markdown.replace(/!\[[^\]]*\]\(attachments\/([^)]+)\)/g, '![[attachments/$1]]');

	return { markdown, images };
}
