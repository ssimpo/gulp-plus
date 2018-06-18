'use strict';

const path = require('path');
const {readdirSync, statSync} = require('fs');
const {xJsFilter} = require('./consts');
const {isString, makeArray} = require('./util');


function _readDirectory(dirPath) {
	return (readdirSync(dirPath)).filter(itemPath=>((itemPath !== '..') && (itemPath !== '..')));
}

function directoryTree(roots=[], {filter=xJsFilter, cwd=undefined}) {
	const dirTree = new Set();

	makeArray(roots).map(details=>{
		try {
			const [root, _cwd] = (isString(details) ?
				[details, (cwd || details)] :
				[details.path, details.cwd]
			);
			const dir = _readDirectory(root);
			const currentTree = new Set();
			dirTree.add(currentTree);
			dir.map(item=>{
				const itemFullPath = path.join(root, item);
				const stats =statSync(itemFullPath);
				if (stats.isDirectory()) {
					currentTree.add(directoryTree(itemFullPath, {filter, cwd:_cwd}));
				} else {
					if (!filter || filter.test(itemFullPath)) return currentTree.add({
						cwd:_cwd,
						path: itemFullPath
					});
				}
			});
		} catch(err) {
			//console.error(err);
		}
	});

	return dirTree;
}

module.exports = {
	directoryTree
};