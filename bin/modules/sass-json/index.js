'use strict';

const sass = require('sass');
const parser = require('./sass-to-json');
const types = sass.types;

function encode (value) {
	let resolvedValue = JSON.stringify(parser(value, { precision: 10 }));
	return new types.String(resolvedValue);
}
module.exports.encode = encode;

module.exports = {
	'json-encode($value)': encode
}