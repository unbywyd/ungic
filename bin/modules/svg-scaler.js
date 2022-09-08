let SvgPath = require('svgpath');
let sax = require('sax');

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function echoOpenTag(node) {
  const stringArr = [];
  stringArr.push('<');
  stringArr.push(node.name);
  Object.keys(node.attributes).forEach(key => {
    stringArr.push(' ');
    stringArr.push(key);
    stringArr.push('="');
    stringArr.push(String(node.attributes[key]).replace('"', '&quot;'));
    stringArr.push('"');
  });
  stringArr.push('>');
  return stringArr.join('');
}

function echoCloseTag(nodeName) {
  return ['</', nodeName, '>'].join('');
}

module.exports = class SVGTranslator {
  constructor(options) {
    if (typeof options !== 'object') {
      throw new Error('options need an object');
    }

    this.options = options;
    this.scale = options.scale || 1;
    this.baseSize = null;
    this.dx = 0;
    this.dy = 0;
  }

  process(svgSrcString) {
    return new Promise((resolve, reject) => {
      let svgDestString = '';
      const parser = sax.parser(true); // set to false for html-mode

      parser.onerror = reject;

      parser.onopentag = node => {
        this.translate(node);
        svgDestString += echoOpenTag(node);
      };

      parser.onclosetag = nodeName => {
        svgDestString += echoCloseTag(nodeName);
      };

      parser.onend = () => {
        // need this for windows issue
        resolve(`<?xml version="1.0"?>${svgDestString}`);
      }; // start process


      parser.write(svgSrcString).close();
    });
  }

  translate(n) {
    const node = n;

    switch (node.name) {
      case 'svg':
        this.svgCenterScale(node);
        break;

      case 'path':
        node.attributes.d = new SvgPath(node.attributes.d).translate(this.dx, this.dy).scale(this.scale).abs().round(1) // Here the real rounding happens
        .rel().round(1) // Fix js floating point error/garbage after rel()
        .toString();
        break;

      case 'rect':
      case 'line':
      case 'circle':
      case 'ellipse':
        this.nodeBaseShapeScale(node);
        break;

      case 'polyline':
      case 'polygon':
        this.nodePointsShapeScale(node);
        break;

      default:
    }
  }

  svgCenterScale(n) {
    const node = n;

    if (!node.attributes.height && node.attributes.viewBox) {
      const _node$attributes$view = node.attributes.viewBox.split(' '),
            _node$attributes$view2 = _slicedToArray(_node$attributes$view, 4),
            height = _node$attributes$view2[3];
      node.attributes.height = height;
    }

    if (!node.attributes.width && node.attributes.viewBox) {
      const _node$attributes$view3 = node.attributes.viewBox.split(' '),
            _node$attributes$view4 = _slicedToArray(_node$attributes$view3, 3),
            width = _node$attributes$view4[2];

      node.attributes.width = width;
    }
    //console.log(node.attributes.height);
    node.attributes.width = parseFloat(node.attributes.width);
    node.attributes.height = parseFloat(node.attributes.height);

    this.dx = 0;
    this.dy = 0;

    if (this.options.width) {
      this.baseSize = this.options.width;
      if (node.attributes.width >= node.attributes.height) {
        this.scale = this.options.width / node.attributes.width;
        this.dy = (node.attributes.width - node.attributes.height) / 2;
      } else {
        this.scale = this.options.width / node.attributes.height;
        this.dx = (node.attributes.height - node.attributes.width) / 2;
      }

      node.attributes.width = this.baseSize;
      node.attributes.height = this.baseSize;
    } else {
      node.attributes.width *= this.scale;
      node.attributes.height *= this.scale;
    }

    node.attributes.viewBox = [0, 0, node.attributes.width, node.attributes.height].join(' ');
  }

  nodeBaseShapeScale(n) {
    const node = n;
    const dxAttrs = ['cx', 'x', 'x1', 'x2'];
    const dyAttrs = ['cy', 'y', 'y1', 'y2'];
    const scaleAttrs = ['width', 'height', 'rx', 'ry', 'r'].concat(dxAttrs).concat(dyAttrs);

    if (!node.attributes) {
      throw new Error('not attributes');
    }

    Object.keys(node.attributes).forEach(attrKey => {
      if (scaleAttrs.indexOf(attrKey) > -1) {
        node.attributes[attrKey] *= this.scale;
      }

      if (dxAttrs.indexOf(attrKey) > -1) {
        node.attributes[attrKey] += this.dx;
      }

      if (dyAttrs.indexOf(attrKey) > -1) {
        node.attributes[attrKey] += this.dy;
      }
    });
  }

  nodePointsShapeScale(n) {
    const node = n;
    let pair = null;

    if (!node.attributes.points) {
      throw new Error('not points');
    }

    node.attributes.points = node.attributes.points.replace(/(^\s*)|(\s*$)/g, '') // trim
    .split(/\s+/).map(point => {
      pair = point.split(',');
      pair[0] = pair[0] * this.scale + this.dx;
      pair[1] = pair[1] * this.scale + this.dy;
      return pair.join(',');
    }).join(' ');
  }

}