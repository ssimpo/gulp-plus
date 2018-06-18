'use strict';

const path = require('path');
const {directoryTree} = require('./directoryTree');
const {xJsFilter, xTaskNeverDefinedError, taskImports} = require('./consts');
const {forOwn, getGulp, isFunction, isObject, isString, makeArray, pick} = require('./util');

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
		if (!Array.isArray(task)) return task;
		return gulp[!isSerial?'series':'parallel'](..._arrayToTasks(task, gulp, !isSerial));
	}));
}

function _getTask(taskPath, taskId, gulp) {
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
	if (!!task.watch && (task.fn.length === 1) && (isFunction(task.fn[0]))) {
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
			const watch = ()=>gulp.watch(source, (!!tasks ? _arrayToTasks(tasks, gulp) : task.fn));
			task.fn = gulp.series([task.fn, watch]);
			delete task.watch;
		}
	});
}


async function taskTree(roots=[], {filter=xJsFilter, gulp=getGulp(4)}) {
	const tree = await directoryTree(roots, filter);
	const tasks = _treeIterator(tree, {filter, gulp});
	_expandGlobs(tasks);
	_addSeries(tasks, gulp);
	_addWatchers(tasks, gulp);

	return tasks;
}

module.exports = {
	taskTree
};