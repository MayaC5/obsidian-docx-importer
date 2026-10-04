import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
// eslint-disable-next-line import/no-extraneous-dependencies -- Verify Mammoth's transitive parser contract.
import { DOMParser } from '@xmldom/xmldom';
import { describe, expect, it } from 'vitest';

import { patchMammothXmlParser } from './build-compat.mjs';

const require = createRequire(import.meta.url);
const underscoreShim = require('./build-shims/underscore.cjs');

describe('Mammoth XML compatibility', () => {
  it('reproduces the MIME type requirement from the secured XML parser', () => {
    const parser = new DOMParser();

    expect(() => parser.parseFromString('<document />')).toThrow('provided mimeType "undefined"');
    expect(parser.parseFromString('<document />', 'text/xml').documentElement.tagName).toBe('document');
  });

  it('supplies the MIME type required by the secured XML parser', () => {
    const sourcePaths = [
      require.resolve('mammoth/lib/xml/xmldom.js'),
      require.resolve('mammoth/mammoth.browser.js'),
    ];

    for (const sourcePath of sourcePaths) {
      const patched = patchMammothXmlParser(readFileSync(sourcePath, 'utf8'));
      expect(patched).toContain('domParser.parseFromString(string, "text/xml");');
      expect(patched).not.toContain('domParser.parseFromString(string);');
      expect(patched).toContain('onError: function(level, message)');
      expect(patched).not.toContain('errorHandler: function(level, message)');
    }
  });

  it('fails safely if a Mammoth update changes the code being patched', () => {
    expect(() => patchMammothXmlParser('module.exports = {};')).toThrow(
      'Mammoth XML parser signature changed',
    );
  });
});

describe('legacy Underscore shim', () => {
	it('provides parser combinator foldl and clone operations', () => {
		expect(underscoreShim.foldl([1, 2, 3], (total, value) => total + value, 0)).toBe(6);
		expect(underscoreShim.clone({ value: 1 })).toEqual({ value: 1 });
		expect(underscoreShim.clone([1, 2])).toEqual([1, 2]);
	});
});
