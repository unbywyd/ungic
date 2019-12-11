const postcss = require('postcss');
const extractor = require('css-color-extractor');
module.exports = postcss.plugin('ungic-theme', function (opts) {
  opts = opts || {}
  return function (root, result) {
    root.walkRules(function(rule) {
        let regexp = /(^.un-inverse|^.un-theme)/g;
        let props = {
            'background': 'background-color',
            'border': 'border-color',
            'border-top': 'border-top-color',
            'border-right': 'border-right-color',
            'border-bottom': 'border-bottom-color',
            'border-left': 'border-left-color',
            'outline': 'outline-color'
        };
        if(regexp.test(rule.selector)) {
            rule.walkDecls(decl => {
                if (decl.prop) {
                    let prop = decl.prop;
                    let colors = extractor.fromDecl(decl);
                    if(!colors.length) {
                        decl.remove();
                    } else {
                        if(props[prop] && colors.length === 1) {
                            decl.prop = props[prop];
                            decl.value = colors[0];
                        }
                    }
                }
                if(!rule.nodes.length) {
                    rule.remove();
                }
            })
        }
    });
  }
});