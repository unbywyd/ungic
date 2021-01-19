'use strict';

const sass = require('sass');
const rgbHex = require('rgb-hex');
const types = sass.types;
const Color = require('color-converter').default;
const model = require('../model');

function createRound(methodName) {
    const func = Math[methodName]
        return (number, precision) => {
        precision = precision == null ? 0 : (precision >= 0 ? Math.min(precision, 292) : Math.max(precision, -292))
        if (precision) {
          // Shift with exponential notation to avoid floating-point issues.
          // See [MDN](https://mdn.io/round#Examples) for more details.
          let pair = `${number}e`.split('e')
          const value = func(`${pair[0]}e${+pair[1] + precision}`)

          pair = `${value}e`.split('e')
          return +`${pair[0]}e${+pair[1] - precision}`
        }
        return func(number)
    }
}
let round = createRound('round');
/**
 * @param  {sass.types.*} value
 * @param  {Object} opts
 *
 * @return {Mixed}
 */
function getJsonValueFromSassValue ( value, opts ) {
	let rgbValue = [];
	let resolvedValue, alphaValue;
	if ( value instanceof types.List ) {
		resolvedValue = listToArray(value, opts);
	} else if ( value instanceof types.Map ) {
		resolvedValue = mapToObject(value, opts);
	} else if ( value instanceof types.Color ) {
		rgbValue = [value.getR(), value.getG(), value.getB()];
		alphaValue = value.getA();
		if ( alphaValue === 1 ) {
			resolvedValue = `#${rgbHex.apply(null, rgbValue)}`;
		} else {
			resolvedValue = `rgba(${rgbValue.join(',')},${alphaValue})`;
		}
	} else if ( value instanceof types.Number ) {
		if ( value.getUnit() !== '' ) {
			resolvedValue = String(round(Number(value.getValue()), opts.precision) + value.getUnit());
		} else {
			resolvedValue = round(Number(value.getValue()), opts.precision);
		}
	} else {
		try {
			resolvedValue = value.getValue();
		} catch ( e ) {
			resolvedValue = null;
		}
	}
	return resolvedValue;
}

/**
 * @param  {sass.types.List} list
 * @param  {Object} opts
 *
 * @return {Array}
 */
function listToArray ( list, opts ) {
	const length = list.getLength();
	const data = [];
	for ( let i = 0; i < length; i++ ) {
		const value = getJsonValueFromSassValue(list.getValue(i), opts);
		data.push(value);
	}
	return data;
}

/**
 * @param  {sass.types.Map} map
 * @param  {Object} opts
 *
 * @return {Object}
 */
function mapToObject ( map, opts ) {
	const length = map.getLength();
	const data = {};
	for ( let i = 0; i < length; i++ ) {
		let key = map.getKey(i);
		if(key instanceof types.Color) {
			key = Color.fromRGB(key.getR(), key.getG(), key.getB()).toName().toLowerCase();
		} else {
			key = key.getValue();
		}
		const value = getJsonValueFromSassValue(map.getValue(i), opts);
		data[key] = value;
	}
	return data;
}

module.exports.mapToObject = mapToObject;

module.exports.getJsonValueFromSassValue = getJsonValueFromSassValue;
