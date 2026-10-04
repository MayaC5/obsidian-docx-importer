import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
	resolve: {
		// esbuild honors Mammoth's `browser` map in the Obsidian bundle. Vitest
		// runs in Node, so point it at the same implementation explicitly.
		alias: {
			mammoth: 'mammoth/mammoth.browser.js',
			obsidian: fileURLToPath(new URL('./src/test/obsidian.ts', import.meta.url)),
		},
	},
	test: {
		environment: 'jsdom',
	},
});
