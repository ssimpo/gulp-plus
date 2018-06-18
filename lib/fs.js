'use strict';

const fs = require('fs');
const util = require('util');

const hasPromiseApi = (!!fs.promises);

function readdir() {
	return ((hasPromiseApi) ? fs.promises.readdir :util.promisify(fs.readdir));
}

function stat() {
	return ((hasPromiseApi) ? fs.promises.stat :util.promisify(fs.stat));
}

module.exports = {
	readdir: readdir(),
	stat: stat()
};