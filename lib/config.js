'use strict';

const path = require('path');
const {xIsDigit} = require('./consts');
const {get, isObject, merge, pick, set, substitute} = require('./util');

function loadConfig(cwd=process.cwd(), id='gulp', copyProps=[], defaultPropValues={}) {
	const packageData = getPackageData(cwd);
	const selectedPackageData = packageData[id] || {};

	const config = merge(
		{cwd, nodeVersion: parseFloat(process.versions.node.split('.').slice(0, 2).join('.'))},
		selectedPackageData,
		pick(packageData, copyProps.concat(selectedPackageData.copyProps || []), defaultPropValues),
		getPackageData(cwd, selectedPackageData.local || 'local.json')
	);

	copyProps.concat(selectedPackageData.copyProps || []).forEach(toPick=>{
		const toSet = toPick.split('.');
		if (toSet.length > 1) toSet.shift();
		set(config, toSet.join('.'), get(packageData, toPick, get(defaultPropValues, toPick)))
	});

	return substitute(config);
}

function getPackageData(cwd=process.cwd(), fileName='package.json') {
	const fullPath = path.join(cwd, fileName);
	try {
		return require(fullPath);
	} catch(err) {
		return {};
	}
}

function processSettings(obj, parent, parentProp) {
	let allNumbers = true;
	Object.keys(obj).forEach(propName=>{
		allNumbers = allNumbers && xIsDigit.test(propName);
	});

	if (allNumbers && parent && parentProp) {
		parent[parentProp] = Object.keys(obj).map(propName=>obj[propName]);
	} else {
		Object.keys(obj).forEach(propName=>{
			const value = obj[propName];
			if (isObject(value)) processSettings(value, obj, propName);
		});
	}
}

function getSettings() {
	const cmdArgvs = require('yargs').argv;
	const cmdArgvSettings = {};
	if (cmdArgvs && cmdArgvs.settings) {
		processSettings(merge(cmdArgvSettings, cmdArgvs.settings));
		delete cmdArgvs.settings;
	}

	return merge({}, loadConfig(), cmdArgvs, cmdArgvSettings);
}

module.exports = {
	getSettings, getPackageData, processSettings, loadConfig
};