'use strict';

const forOwn = require('lodash.forown');
const isFunction = require('lodash.isfunction');
const isObject = require('lodash.isobject');
const isString = require('lodash.isstring');
const pick = require('lodash.pick');

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

function iterativeTry(action) {
	let counter = 1
}

module.exports = {
	forOwn, getGulp, isFunction, isObject, isString, makeArray, pick
};