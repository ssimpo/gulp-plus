'use strict';

const path = require('path');
const {readdir, stat} = require('./fs');
const {xJsFilter} = require('./consts');
const {isString, makeArray} = require('./util');


async function _readDirectory(dirPath) {
	return (await readdir(dirPath)).filter(itemPath=>((itemPath !== '..') && (itemPath !== '..')));
}

async function directoryTree(roots=[], {filter=xJsFilter, cwd=undefined}) {
	const dirTree = new Set();

	await Promise.all(makeArray(roots).map(async (details)=>{
		try {
			const [root, _cwd] = (isString(details) ?
				[details, (cwd || details)] :
				[details.path, details.cwd]
			);
			const dir = await _readDirectory(root);
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
	directoryTree
};