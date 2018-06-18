'use strict';

module.exports = {
	xJsFilter: /\.js/,
	xIsDigit: /^\d+$/,
	xTaskNeverDefinedError: /Task never defined/,
	taskImports: ['cwd', 'help', 'watch'],
	xQuoted: /^(["'])(.*)\1$/,
	xObject: /^\{.*\}$/,
	xArray: /^\[.*\]$/,
	xPreFunctionParams: /\)[\s\S]*/,
	xPostFunctionParams: /^.*?\(/,
	xRollupPluginTest: /^rollup[A-Z0-9]/,
	paramDefaultMatchers: new Map([['null',null],['undefined',undefined],['true',true],['false',false]])
};
