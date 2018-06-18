'use strict';

const path = require('path');
const {isString, makeArray} = require('./util');
const {readdir, stat} = require('./fs');


async function readDirectory(dirPath) {
	return (await readdir(dirPath)).filter(itemPath=>((itemPath !== '..') && (itemPath !== '..')));
}

function _treeIterator(tree, filter, tasks={}) {
	tree.forEach(item=>{
		if (item instanceof Set) return _treeIterator(item, filter, tasks);
		const taskId = item.path
			.replace(item.cwd, '')
			.replace(filter, '')
			.split(path.sep)
			.filter(item=>item)
			.join(':');
		tasks[taskId] = {
			file: item.path,
			cwd: item.cwd
		};
	});
	return tasks;
}

async function taskDirectoryTree(roots=[], filter=undefined) {
	const tree = await directoryTree(roots, filter);
	return _treeIterator(tree, filter);
}

async function directoryTree(roots=[], {filter=undefined, cwd=undefined}) {
	const dirTree = new Set();

	await Promise.all(makeArray(roots).map(async (details)=>{
		try {
			const root = isString(details) ? details : details.path;
			const _cwd = isString(details) ? (cwd || root) : details.cwd;
			const dir = await readDirectory(root);
			const currentTree = new Set();
			dirTree.add(currentTree);
			await Promise.all(dir.map(async (item)=>{
				const itemFullPath = path.join(root, item);
				const stats = await stat(itemFullPath);
				if (stats.isDirectory()) {
					currentTree.add(await directoryTree(itemFullPath, {filter, cwd:_cwd}));
				} else {
					if (!filter || filter.test(itemFullPath)) return currentTree.add({
						cwd:_cwd,
						path: itemFullPath
					});
				}
			}));
		} catch(err) {
			//console.error(err);
		}
	}));

	return dirTree;
}

module.exports = {
	directoryTree, taskDirectoryTree
};