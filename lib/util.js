'use strict';

const requireLike = require('require-like');
const flatten = require('lodash.flattendeep');
const forOwn = require('lodash.forown');
const get = require('lodash.get');
const isFunction = require('lodash.isfunction');
const isObject = require('lodash.isobject');
const isString = require('lodash.isstring');
const kebabCase = require('lodash.kebabcase');
const pick = require('lodash.pick');
const set = require('lodash.set');
const {
	xQuoted, xObject, xArray, xPreFunctionParams, xPostFunctionParams,
	paramDefaultMatchers, xRollupPluginTest
} = require('./consts');

const paramCache = new WeakMap();

let getParameters;

function isNumeric(value) {
	return !Number.isNaN(parseFloat(value)) && isFinite(value);
}

function replaceSequence(txt, sequence) {
	let _sequence = (sequence?sequence:txt);

	let _replaceSequence = txt=>{
		let _txt = (isString(txt) ? txt : txt.toString());
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

function getModule(paramName, cwd, inject) {
	if (Array.isArray(paramName)) return paramName.map(paramName=>getModule(paramName, cwd, inject));
	//if (paramName in (settings.injectionMapper || {})) paramName = (settings.injectionMapper || {})[paramName];
	if (inject.hasOwnProperty(paramName) && !isString(inject[paramName])) return inject[paramName];

	const require = requireLike(cwd || __dirname);
	const moduleId = ((inject.hasOwnProperty(paramName) && isString(inject[paramName])) ?
			inject[paramName] :
			`gulp-${kebabCase(paramName)}`
	);

	try {
		return require(moduleId);
	} catch(err) {
		try {
			if (xRollupPluginTest.test(paramName)) {
				try {
					return require(kebabCase(paramName).replace('rollup-','rollup-plugin-'));
				} catch(err) {}
			}
			return require(kebabCase(paramName));
		} catch(err) {
			throw new RangeError(`Could not inject module for ${paramName}, did you forget to 'npm install' / 'yarn add' the given module.`)
		}
	}
}

function substitute(obj) {
	const result = (new Function(...[
		...Object.keys(obj),
		'return JSON.parse(`' + JSON.stringify(obj) + '`);'
	]))(...Object.keys(obj).map(key=>obj[key]));

	return ((JSON.stringify(result) !== JSON.stringify(obj)) ? substitute(result) : result);
}

module.exports = {
	flatten, forOwn, get, getGulp, getModule, isFunction, isNumeric, isObject, isString,
	kebabCase, makeArray, parseParameters, pick, replaceSequence, set, substitute
};