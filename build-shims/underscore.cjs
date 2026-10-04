'use strict';

const isArrayLike = value => value != null && Number.isInteger(value.length) && value.length >= 0;
const keys = value => value == null ? [] : Object.keys(Object(value));
const iteratee = value => typeof value === 'function' ? value : item => item == null ? undefined : item[value];

function forEach(collection, callback) {
	if (isArrayLike(collection)) {
		for (let index = 0; index < collection.length; index++) callback(collection[index], index, collection);
	} else {
		for (const key of keys(collection)) callback(collection[key], key, collection);
	}
	return collection;
}

function map(collection, callback) {
	const result = [];
	forEach(collection, (value, key, source) => result.push(callback(value, key, source)));
	return result;
}

function foldl(collection, callback, initialValue) {
	let accumulator = initialValue;
	let hasAccumulator = arguments.length >= 3;
	forEach(collection, (value, key, source) => {
		if (!hasAccumulator) {
			accumulator = value;
			hasAccumulator = true;
		} else {
			accumulator = callback(accumulator, value, key, source);
		}
	});
	return accumulator;
}

function clone(value) {
	if (Array.isArray(value)) return value.slice();
	if (value !== null && typeof value === 'object') return Object.assign({}, value);
	return value;
}

function filter(collection, callback) {
	const result = [];
	forEach(collection, (value, key, source) => {
		if (callback(value, key, source)) result.push(value);
	});
	return result;
}

function some(collection, callback) {
	if (isArrayLike(collection)) {
		for (let index = 0; index < collection.length; index++) {
			if (callback(collection[index], index, collection)) return true;
		}
	} else {
		for (const key of keys(collection)) {
			if (callback(collection[key], key, collection)) return true;
		}
	}
	return false;
}

function find(collection, callback) {
	if (isArrayLike(collection)) {
		for (let index = 0; index < collection.length; index++) {
			if (callback(collection[index], index, collection)) return collection[index];
		}
	} else {
		for (const key of keys(collection)) {
			if (callback(collection[key], key, collection)) return collection[key];
		}
	}
	return undefined;
}

function flatten(values, shallow = false) {
	const result = [];
	for (const value of values ?? []) {
		if (Array.isArray(value)) {
			if (shallow) result.push(...value);
			else result.push(...flatten(value));
		} else {
			result.push(value);
		}
	}
	return result;
}

function isEqual(left, right) {
	if (Object.is(left, right)) return true;
	if (left == null || right == null || typeof left !== 'object' || typeof right !== 'object') return false;
	const leftKeys = keys(left);
	const rightKeys = keys(right);
	return leftKeys.length === rightKeys.length && leftKeys.every(
		key => Object.prototype.hasOwnProperty.call(right, key) && isEqual(left[key], right[key]),
	);
}

function indexBy(collection, callback) {
	const getKey = iteratee(callback);
	const result = {};
	forEach(collection, (value, key, source) => {
		result[getKey(value, key, source)] = value;
	});
	return result;
}

module.exports = {
	any: some,
	clone,
	extend: Object.assign,
	filter,
	find,
	findIndex: (collection, callback) => Array.prototype.findIndex.call(collection, callback),
	foldl,
	flatten,
	forEach,
	indexBy,
	invert: object => Object.fromEntries(keys(object).map(key => [object[key], key])),
	isArray: Array.isArray,
	isEqual,
	isFunction: value => typeof value === 'function',
	isString: value => typeof value === 'string' || value instanceof String,
	last: array => array == null || array.length === 0 ? undefined : array[array.length - 1],
	map,
	pluck: (collection, property) => map(collection, iteratee(property)),
	some,
	values: object => Object.values(object),
};
