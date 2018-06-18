'use strict';

const {getGulp} = require('./lib/util');
const {taskTree} = require('./lib/taskTree');

module.exports = (roots=[], options={})=>{
	const gulp = options.gulp || getGulp(4);
	return taskTree(roots, {...options, gulp})
};