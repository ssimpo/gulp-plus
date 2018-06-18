'use strict';

const path = require('path');
const {directoryTree} = require('./directoryTree');
const {xJsFilter, taskImports} = require('./consts');
const {getGulp, isFunction, isObject, isString, makeArray, pick} = require('./util');

function _getTaskNameFromItem(item, filter='') {
	return item.path
		.replace(item.cwd, '')
		.replace(filter, '')
		.split(path.sep)
		.filter(item=>item)
		.join(':');
}

function _arrayToTasks(tasks, gulp, isSerial=true) {
	return gulp[isSerial?'series':'parallel'](makeArray(tasks).map(task=>{
		if (Array.isArray(task)) {
			if (isSerial) {
				return gulp.parallel(..._arrayToTasks(task, gulp, !isSerial));
			} else {
				return gulp.series(..._arrayToTasks(task, gulp, !isSerial));
			}
		}
		return task;
	}));
}

function _getTask(taskPath, taskId, gulp) {
	const taskModule = require(taskPath);
	const task = {fn:()=>{}};
	if (isFunction(taskModule)) {
		task.fn = [taskModule];
		Object.assign(task, pick(task.fn, taskImports));
	} else if (Array.isArray(taskModule)) {
		task.fn = taskModule;
	} else if (isObject(taskModule) || isFunction(taskModule)) {
		Object.assign(task, pick(taskModule, ['fn', ...taskImports]));
	} else if (isString(taskModule)) {
		task.fn = [taskModule];
	}

	task.fn = makeArray(task.fn);
	if ((task.fn.length === 1) && (isFunction(task.fn[0]))) {
		task.fn = task.fn[0];
		gulp.task(taskId, task.fn);
	}

	return task;
}

function _treeIterator(tree, {filter, gulp}, tasks={}) {
	tree.forEach(item=>{
		if (item instanceof Set) return _treeIterator(item, {filter, gulp}, tasks);
		const taskId = _getTaskNameFromItem(item, filter);
		tasks[taskId] = {
			file: item.path,
			cwd: item.cwd,
			..._getTask(item.path, taskId, gulp)
		};
	});
	return tasks;
}

function _getArrayTasksIds(tasks) {
	return Object.keys(tasks).filter(
		taskId=>Array.isArray(tasks[taskId].fn)
	);
}

function _replaceGlobDeps(tasks, searcher, depId) {
	const found = [];
	const finder = new RegExp(searcher[depId].replace('*', '.*?'));
	for (let id in tasks) {
		if (finder.test(id)) found.push(id);
	}
	if (!found.length) return;
	searcher.splice.apply(searcher, [depId, 1].concat(found));
}

function _expandGlobs(tasks) {
	_getArrayTasksIds(tasks).forEach(taskId=>{
		const task = tasks[taskId];
		[...task.fn].forEach((taskId, depNo)=>{
			if (isString(taskId) && (taskId.indexOf('*') !== -1)) _replaceGlobDeps(tasks, task.fn, depNo);
		});
	})
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
			}
		});
		arrayTasks = _getArrayTasksIds(tasks);
	}
}

async function taskTree(roots=[], {filter=xJsFilter, gulp=getGulp(4)}) {
	const tree = await directoryTree(roots, filter);
	const tasks = _treeIterator(tree, {filter, gulp});
	_expandGlobs(tasks);
	_addSeries(tasks, gulp);

	return tasks;
}

module.exports = {
	taskTree
};