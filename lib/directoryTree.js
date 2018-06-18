'use strict';

const path = require('path');
const {readdirSync, statSync} = require('fs');
const {xJsFilter} = require('./consts');
const {flatten, isString, makeArray} = require('./util');


function _readDirectory(dirPath) {
	return (readdirSync(dirPath)).filter(itemPath=>((itemPath !== '..') && (itemPath !== '..')));
}

function directoryTree(roots=[], {filter=xJsFilter, cwd=undefined, directories=['']}) {
	const _roots = flatten(makeArray(roots).map(root=>directories.map(directory=>{
		return {
			path: path.join(root, directory),
			cwd:(cwd||root),
			directory
		};
	})));

	return _directoryTree(_roots,  {filter, cwd});
}

function _directoryTree(roots=[], {filter=xJsFilter, cwd=undefined, directory=undefined}) {
	const dirTree = new Set();

	makeArray(roots).map(details=>{
		try {
			const [root, _cwd, _directory] = (isString(details) ?
				[details, (cwd || details), (directory||'')] :
				[details.path, details.cwd, details.directory||directory]
			);
			const dir = _readDirectory(root);
			const currentTree = new Set();
			dirTree.add(currentTree);
			dir.map(item=>{
				const itemFullPath = path.join(root, item);
				const stats = statSync(itemFullPath);
				if (stats.isDirectory()) {
					currentTree.add(_directoryTree(itemFullPath, {filter, cwd:_cwd, directory:_directory}));
				} else {
					if (!filter || filter.test(itemFullPath)) {
						return currentTree.add({
							cwd:_cwd,
							path: itemFullPath,
							directory:_directory
						});
					}
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