const postcss = require('postcss');
const _ = require('underscore');
const extractor = require('css-color-extractor');
module.exports = postcss.plugin('ungic-theme', function (opts) {
  opts = opts || {}
  return function (root, result) {
    let regexp = /((\[dir[^\s]+)\s+)(.un-inverse|.un-theme)/;
    root.walkRules(function(rule) {
        let toReplace = (selector) => {
          return selector.split(/,\s+/).map(selector => {
            let search = selector.match(regexp);
            if(search) {
                return toReplace(selector.replace(search[1], search[2]));
            }
            return selector;
          }).join(',');
        }
        rule.selector = toReplace(rule.selector);
    });
  }
});