'use strict';

class SafePromise extends Promise {
	static resolve(value) {
		return value instanceof SafePromise ? value : new SafePromise(resolve => resolve(value));
	}

	static reject(reason) {
		return new SafePromise((_, reject) => reject(reason));
	}

	static all(values) {
		return new SafePromise((resolve, reject) => Promise.all(values).then(resolve, reject));
	}

	static props(object) {
		const entries = Object.entries(object);
		return SafePromise.all(entries.map(([, value]) => value)).then(
			values => Object.fromEntries(entries.map(([key], index) => [key, values[index]])),
		);
	}

	static promisify(callbackFunction) {
		return function(...args) {
			return new SafePromise((resolve, reject) => {
				callbackFunction.call(this, ...args, (error, value) => error ? reject(error) : resolve(value));
			});
		};
	}

	static mapSeries(values, callback) {
		return Array.from(values).reduce(
			(promise, value, index) => promise.then(results =>
				SafePromise.resolve(callback(value, index)).then(result => [...results, result])),
			SafePromise.resolve([]),
		);
	}

	static attempt(callback) {
		return new SafePromise(resolve => resolve()).then(callback);
	}

	tap(callback) {
		return this.then(value => SafePromise.resolve(callback(value)).then(() => value));
	}

	caught(callback) {
		return this.catch(callback);
	}
}

SafePromise.Promise = SafePromise;
module.exports = () => SafePromise;
