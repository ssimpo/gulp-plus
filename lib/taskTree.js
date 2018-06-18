'use strict';

const requireLike = require('require-like');
const path = require('path');
const {directoryTree} = require('./directoryTree');
const {xJsFilter, xTaskNeverDefinedError, taskImports, xIsDigit} = require('./consts');
const {
	forOwn, get, getGulp, getModule, isFunction, isObject, isString,
	makeArray, merge, parseParameters, pick, set, substitute
} = require('./util');


function _getInjection(func, cwd, inject) {
	return parseParameters(func).map(param=>getModule(param, cwd, inject));
}

function _getTaskNameFromItem(item, filter='') {
	const directory = (item.directory || '').split(path.sep).filter(item=>item).join(':');
	const dirReplacer = ((item.directory && (item.directory !== '')) ? new RegExp(`^${directory}\\:`) : '');

	return item.path
		.replace(item.cwd, '')
		.replace(filter, '')
		.split(path.sep)
		.filter(item=>item)
		.join(':')
		.replace(dirReplacer, '');
}

function _arrayToTasks(tasks, gulp, isSerial=true) {
	return gulp[isSerial?'series':'parallel'](makeArray(tasks).map(task=>{
		if (!Array.isArray(task)) return task;
		return gulp[!isSerial?'series':'parallel'](..._arrayToTasks(task, gulp, !isSerial));
	}));
}

function _getTask(taskPath, taskId, cwd, settings, gulp) {
	const require = requireLike(taskPath);
	const taskModule = require(taskPath);

	const task = {fn:()=>{}};
	if (isFunction(taskModule)) {
		task.fn = [...makeArray(taskModule.deps), taskModule];
		Object.assign(task, pick(taskModule, taskImports));
		['deps', ...taskImports].forEach(propName=>{
			delete taskModule[propName];
		});
	} else if (Array.isArray(taskModule)) {
		task.fn = taskModule;
	} else if (isObject(taskModule)) {
		Object.assign(task, pick(taskModule, ['fn', ...taskImports]));
		task.fn = [...makeArray(taskModule.deps), task.fn];
	} else if (isString(taskModule)) {
		task.fn = [taskModule];
	}

	task.fn = makeArray(task.fn);
	task.settings = merge({}, settings, _loadConfig(cwd));
	if (!task.watch && (task.fn.length === 1) && (isFunction(task.fn[0]))) {
		const fn = task.fn[0];
		const _gulp = {...gulp,
			dest: (path, options={})=>gulp.dest(path, {cwd, ...options}),
			src: (globs, options={})=>gulp.src(globs, {cwd, ...options}),
			symlink: (folder, options={})=>gulp.symlink(folder, {cwd, ...options}),
			watch: (globs, options={})=>gulp.watch(globs, {cwd, ...options})
		};
		task.fn = (done)=>fn(..._getInjection(fn, cwd, {gulp:_gulp, done, settings:task.settings}));
		gulp.task(taskId, task.fn);
	} else if (isFunction(task.watch)) {
		task.watch = task.watch(task.settings);
	}

	return task;
}

function _loadConfig(cwd=process.cwd(), id='gulp', copyProps=[], defaultPropValues={}) {
	const packageData = _getPackageData(cwd);
	const selectedPackageData = packageData[id] || {};

	const config = merge(
		{cwd, nodeVersion: parseFloat(process.versions.node.split('.').slice(0, 2).join('.'))},
		selectedPackageData,
		pick(packageData, copyProps.concat(selectedPackageData.copyProps || []), defaultPropValues),
		_getPackageData(cwd, selectedPackageData.local || 'local.json')
	);

	copyProps.concat(selectedPackageData.copyProps || []).forEach(toPick=>{
		const toSet = toPick.split('.');
		if (toSet.length > 1) toSet.shift();
		set(config, toSet.join('.'), get(packageData, toPick, get(defaultPropValues, toPick)))
	});

	return substitute(config);
}

function _getPackageData(cwd=process.cwd(), fileName='package.json') {
	const fullPath = path.join(cwd, fileName);
	try {
		return require(fullPath);
	} catch(err) {
		return {};
	}
}

function _treeIterator(tree, {filter, gulp, settings}, tasks={}) {
	tree.forEach(item=>{
		if (item instanceof Set) return _treeIterator(item, {filter, gulp}, tasks);
		const taskId = _getTaskNameFromItem(item, filter);
		tasks[taskId] = {
			file: item.path,
			cwd: item.cwd,
			..._getTask(item.path, taskId, item.cwd, settings, gulp)
		};
	});
	return tasks;
}

function _getArrayTasksIds(tasks) {
	return Object.keys(tasks).filter(taskId=>Array.isArray(tasks[taskId].fn));
}

function _replaceGlobDeps(tasks, searcher, depId) {
	const found = [];
	const finder = new RegExp(searcher[depId].replace('*', '.*?'));
	forOwn(tasks, (task, taskId)=>{
		if (finder.test(taskId)) found.push(taskId);
	});
	if (!found.length) return;
	searcher.splice.apply(searcher, [depId, 1].concat(found));
}

function _expandGlobs(tasks) {
	forOwn(tasks, (task, taskId)=>{
		if (task.watch && task.watch.source) {
			[...task.watch.source].forEach((taskId, depNo)=>{
				if (isString(taskId) && (taskId.indexOf('*') !== -1)) _replaceGlobDeps(tasks, task.watch.source, depNo);
			});
		}
		if (Array.isArray(tasks[taskId].fn)) {
			[...task.fn].forEach((taskId, depNo)=>{
				if (isString(taskId) && (taskId.indexOf('*') !== -1)) _replaceGlobDeps(tasks, task.fn, depNo);
			});
		}
	});
}

function _addSeries(tasks, gulp) {
	let arrayTasks = _getArrayTasksIds(tasks);
	let lastArrayTasksCount = Infinity;
	while ((arrayTasks.length > 0) && (arrayTasks.length < lastArrayTasksCount)) {
		lastArrayTasksCount = arrayTasks.length;
		arrayTasks.forEach(taskId=>{
			const task = tasks[taskId];
			try {
				task.fn = _arrayToTasks(task.fn, gulp, true);
				gulp.task(taskId, task.fn);
			} catch(err) {
				if (!xTaskNeverDefinedError.test(err.toString())) throw err;
			}
		});
		arrayTasks = _getArrayTasksIds(tasks);
	}
}

function _addWatchers(tasks, gulp) {
	forOwn(tasks, task=>{
		if (!!task.watch && !!task.watch.source) {
			const {source, tasks} = task.watch;
			const watch = ()=>gulp.watch(
				source,
				{cwd: task.cwd || process.cwd()},
				(!!tasks ? _arrayToTasks(tasks, gulp) : task.fn)
			);
			task.fn = gulp.series([task.fn, watch]);
			delete task.watch;
		}
	});
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

	return merge({}, _loadConfig(), cmdArgvs, cmdArgvSettings);
}

async function taskTree(roots=[], {filter=xJsFilter, gulp=getGulp(4), directories=['tasks']}) {
	const settings = getSettings();

	const tree = directoryTree(
		[...makeArray(roots), ...makeArray(settings.root)],
		{filter, directories}
	);
	const tasks = _treeIterator(tree, {filter, gulp, settings});
	_expandGlobs(tasks);
	_addSeries(tasks, gulp);
	_addWatchers(tasks, gulp);

	return tasks;
}

module.exports = {
	taskTree
};