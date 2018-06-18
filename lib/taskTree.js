'use strict';

const requireLike = require('require-like');
const path = require('path');
const {directoryTree} = require('./directoryTree');
const {getInjection} = require('./getModule');
const {getSettings, loadConfig} = require('./config');
const {xJsFilter, xTaskNeverDefinedError, taskImports} = require('./consts');
const {forOwn, getGulp, isFunction, isObject, isString, makeArray, merge, pick} = require('./util');

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

function _getTasks(tree, {filter, gulp, settings}) {
	const tasks = _treeIterator(tree, {filter, gulp, settings});
	[_expandGlobs, _addSeries, _addWatchers].forEach(method=>method(tasks, gulp));

	return tasks;
}

function _createTask(taskModule) {
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

	return task;
}

function _getTask(taskPath, taskId, cwd, settings, gulp) {
	const require = requireLike(taskPath);
	const taskModule = require(taskPath);
	const task = _createTask(taskModule);

	task.settings = merge({}, settings, loadConfig(cwd));
	if (!task.watch && (task.fn.length === 1) && (isFunction(task.fn[0]))) {
		const fn = task.fn[0];
		const _gulp = {...gulp,
			dest: (path, options={})=>gulp.dest(path, {cwd, ...options}),
			src: (globs, options={})=>gulp.src(globs, {cwd, ...options}),
			symlink: (folder, options={})=>gulp.symlink(folder, {cwd, ...options}),
			watch: (globs, options={})=>gulp.watch(globs, {cwd, ...options})
		};
		task.fn = (done)=>fn(...getInjection(fn, cwd, {gulp:_gulp, done, settings:task.settings}));
		gulp.task(taskId, task.fn);
	} else if (isFunction(task.watch)) {
		task.watch = task.watch(task.settings);
	}

	return task;
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


function taskTree(roots=[], {filter=xJsFilter, gulp=getGulp(4), directories=['tasks']}) {
	const settings = getSettings();
	const tree = directoryTree(
		[...makeArray(roots), ...makeArray(settings.root)],
		{filter, directories}
	);

	return _getTasks(tree, {filter, gulp, settings});
}

module.exports = {
	taskTree
};