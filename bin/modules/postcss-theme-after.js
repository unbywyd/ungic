const postcss = require('postcss');
const _ = require('underscore');
const extractor = require('css-color-extractor');
module.exports = postcss.plugin('ungic-theme', function (opts) {
  opts = opts || {}
  return function (root, result) {    
    let regexp = new RegExp(`(\\[${opts.dirAttribute.replace(/[^a-zA-Z-]+/g, '')}(?:=(?:"|')?(?:ltr|rtl)(?:"|')?)?\\])\\s+(\\.un-inverse|\\.un-theme|\\[data-ungic-root\\])`, 'gm');
    root.walkRules(function(rule) { 
        rule.selector = rule.selector.replace(regexp, function(match, g1, g2) {
          return g1+g2;
        });

        if(opts.htmlIsRootElement) {
          rule.selector = rule.selector.replace(/\[data-ungic-root\]/gm, 'html');
        }
    });
  }
});