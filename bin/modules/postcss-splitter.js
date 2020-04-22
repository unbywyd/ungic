const postcss = require('postcss');
const _ = require('underscore');
module.exports = postcss.plugin('ungic-splitter', function (opts) {
  opts = opts || {};
  let themes = [];

  return function (root, result) {

    root.walkRules(function(rule) {
        let regex = /\.un-theme-([^.\s\n}{()#$]+)/;
        let m;
        if ((m = regex.exec(rule.selector)) !== null) {
            let theme = m[1];
            let container = _.findWhere(themes, {theme});
            let isNew;

            if(!container) {
                container = {
                    root: new postcss.root(),
                    theme
                }
                isNew = true;
            }
            if(rule.parent.type == 'atrule') {
                let atrule = rule.parent.clone();
                atrule.nodes = [];
                atrule.append(rule);
                container.root.append(atrule);
            } else {
                container.root.append(rule);
            }

            if(!rule.parent.nodes.length) {
                rule.parent.remove();
            }

            if(isNew) {
                themes.push(container);
            }

        }
    });
    root.walkAtRules(rule => {
        if(!rule.nodes || rule.nodes && !rule.nodes.length) {
            rule.remove();
        }
    });
    if(opts.callback) {
        themes = _.map(themes, t => {
            t.root = t.root.toString();
            return t;
        });
        opts.callback(themes);
    }
  }
});