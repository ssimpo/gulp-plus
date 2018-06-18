'use strict';

const {
	xQuoted,
	xObject,
	xArray,
	xPreFunctionParams,
	xPostFunctionParams,
	paramDefaultMatchers
} = require('./consts');
const lodash = lodashLoad([
	'forOwn',
	'get',
	'set',
	'isFunction',
	'isObject',
	'isString',
	'kebabCase',
	'merge',
	'pick',
	'flattenDeep:flatten'
]);

const paramCache = new WeakMap();

let getParameters;

function lodashLoad(methodNames) {
	const lodash = {};
	makeArray(methodNames).forEach(methodName=>{
		let [lodashName, exportName] = methodName.split(':');
		exportName = exportName || lodashName;
		lodashName = lodashName.toLowerCase();
		lodash[exportName] = require(`lodash.${lodashName}`);
	});
	return lodash;
}

function isNumeric(value) {
	return !Number.isNaN(parseFloat(value)) && isFinite(value);
}

function replaceSequence(txt, sequence) {
	let _sequence = (sequence?sequence:txt);

	let _replaceSequence = txt=>{
		let _txt = (lodash.isString(txt) ? txt : txt.toString());
		_sequence.forEach(operation=>{
			_txt = _txt.replace(operation[0], operation[1] || '');
		});
		return _txt;
	};

	return (sequence?_replaceSequence(txt):_replaceSequence)
}

function getGulp(version=4) {
	try {
		return require(((version <= 3) ? 'gulp' : 'gulp4'));
	} catch (err) {
		if (version > 4) return require('gulp');
	}

	throw new Error('Cannot find gulp in node paths.');
}

function makeArray(value) {
	if ((value === undefined) || (value === null) || Number.isNaN(value)) return [];
	if (value instanceof Set) return [...value.values()];
	return (Array.isArray(value)?value:[value]);
}

function parseParameters(func, evaluate=true) {
	getParameters = getParameters || replaceSequence([[xPreFunctionParams],[xPostFunctionParams]]);
	if (paramCache.has(func)) return paramCache.get(func);

	const defaults = new Map();
	const params = getParameters(func).split(',')
		.map(param=>param.trim())
		.map(param=>{
			const [paramName, defaultValue] = param.split('=').map(item=>item.trim());
			if (defaultValue) {
				if (xQuoted.test(defaultValue)) {
					const _defaultValue = xQuoted.exec(defaultValue)[2];
					defaults.set(paramName, ()=>()=>_defaultValue);
				} else if (paramDefaultMatchers.has(defaultValue)) {
					const _defaultValue = paramDefaultMatchers.get(defaultValue);
					defaults.set(paramName, ()=>_defaultValue);
				} else if (isNumeric(defaultValue)) {
					if (defaultValue.indexOf('.') !== -1) {
						const _defaultValue = parseFloat(defaultValue);
						defaults.set(paramName, ()=>_defaultValue);
					} else {
						const _defaultValue = parseInt(defaultValue, 10);
						defaults.set(paramName, ()=>_defaultValue);
					}
				} else if (xArray.test(defaultValue) || xObject.test(defaultValue)) {
					defaults.set(paramName, ()=>JSON.parse(defaultValue));
				} else {
					defaults.set(paramName, ()=>defaultValue);
				}
			}
			return paramName;
		});

	if (!evaluate) return [params, defaults];
	params.defaults = defaults;
	paramCache.set(func, params);
	return params;
}

function substitute(obj) {
	const result = (new Function(...[
		...Object.keys(obj),
		'return JSON.parse(`' + JSON.stringify(obj) + '`);'
	]))(...Object.keys(obj).map(key=>obj[key]));

	return ((JSON.stringify(result) !== JSON.stringify(obj)) ? substitute(result) : result);
}

module.exports = {
	...lodash, getGulp, isNumeric, makeArray, parseParameters, replaceSequence, substitute
};