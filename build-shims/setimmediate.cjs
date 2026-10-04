'use strict';

if (typeof globalThis.setImmediate !== 'function') {
	globalThis.setImmediate = callback => setTimeout(callback, 0);
	globalThis.clearImmediate = handle => clearTimeout(handle);
}
