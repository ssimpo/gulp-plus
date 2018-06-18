'use strict';

const path = require('path');
const requireLike = require('require-like');
const {kebabCase, isString, parseParameters} = require('./util');
const {xRollupPluginTest} = require('./consts');

function getModule(paramName, cwd, inject) {
	if (Array.isArray(paramName)) return paramName.map(paramName=>getModule(paramName, cwd, inject));
	if ((!!inject.settings) && (paramName in (inject.settings.injectionMapper || {}))) {
		paramName = (inject.settings.injectionMapper || {})[paramName];
	}
	if (inject.hasOwnProperty(paramName) && !isString(inject[paramName])) return inject[paramName];

	const require = requireLike(path.join(cwd || __dirname, 'fake.js'));
	const moduleId = ((inject.hasOwnProperty(paramName) && isString(inject[paramName])) ?
			inject[paramName] :
			`gulp-${kebabCase(paramName)}`
	);
	const tried = [moduleId];

	try {
		return require(moduleId);
	} catch(err) {
		try {
			if (xRollupPluginTest.test(paramName)) {
				try {
					const moduleId = kebabCase(paramName).replace('rollup-','rollup-plugin-');
					tried.push(moduleId);
					return require(moduleId);
				} catch(err) {}
			}
			const moduleId = kebabCase(paramName);
			tried.push(moduleId);
			return require(moduleId);
		} catch(err) {
			throw new RangeError(`Could not inject module for ${paramName}, (tried: ${tried.join(', ')}) did you forget to 'npm install' / 'yarn add' the given module.`)
		}
	}
}


function getInjection(func, cwd, inject) {
	return parseParameters(func).map(param=>getModule(param, cwd, inject));
}

module.exports = {
	getModule, getInjection
};