'use strict';

module.exports = callback => {
	if (typeof queueMicrotask === 'function') queueMicrotask(callback);
	else Promise.resolve().then(callback);
};
