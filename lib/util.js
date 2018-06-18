'use strict';

const isString = require('lodash.isstring');

function makeArray(value) {
	if ((value === undefined) || (value === null) || Number.isNaN(value)) return [];
	if (value instanceof Set) return [...value.values()];
	return (Array.isArray(value)?value:[value]);
}

module.exports = {
	isString, makeArray
};