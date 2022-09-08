'use strict';

const sass = require('sass');
const {getJsonValueFromSassValue} = require('./sass-to-json');
const types = sass.types;

function encode (value) {
	let resolvedValue = JSON.stringify(getJsonValueFromSassValue(value, { precision: 10 }));
	return new types.String(resolvedValue);
}
module.exports.encode = encode;

module.exports = {
	'json-encode($value)': encode
}