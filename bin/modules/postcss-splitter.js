const postcss = require('postcss');
const CleanCSS = require('clean-css');
const _ = require('underscore');
module.exports = postcss.plugin('ungic-splitter', function (opts) {
  opts = opts || {};
  let themes = [];
  return function (root, result) {
    root.walkComments(c => c.remove());
    root.walkRules(function(rule) {
        let regex = /\.un-theme-([^.\s\n}:{()#$]+)/;
        let m;
        if (opts.theme && (m = regex.exec(rule.selector)) !== null) {


            let theme = m[1];
            let container = _.findWhere(themes, {theme});
            //console.log(container, theme);
            let isNew;

            if(!container) {
                container = {
                    root: new postcss.root(),
                    theme
                }
                if(opts.inverse) {
                    container.inverse_root = new postcss.root();
                }
                isNew = true;
            }
            if(rule.parent.type == 'atrule') {
                let atrule = rule.parent.clone();
                atrule.nodes = [];
                atrule.append(rule);
                if(opts.inverse && /(?<!("|'|\())\.un-inverse/.test(rule.selector)) {
                    container.inverse_root.append(atrule);
                } else {
                    container.root.append(atrule);
                }
            } else {
                if(opts.inverse && /(?<!("|'|\())\.un-inverse/.test(rule.selector)) {
                    container.inverse_root.append(rule);
                } else {
                    container.root.append(rule);
                }
            }

            if(!rule.parent.nodes.length) {
                rule.parent.remove();
            }

            if(isNew) {
                themes.push(container);
            }

        } else if(opts.inverse && /(?<!("|'|\())\.un-inverse/.test(rule.selector)) {
            let container = _.findWhere(themes, {theme: 'default'});
            let isNew;

            if(!container) {
                container = {
                    inverse_root: new postcss.root(),
                    //root: new postcss.root(),
                    theme: 'default'
                }
                isNew = true;
            }

            if(rule.parent.type == 'atrule') {
                let atrule = rule.parent.clone();
                atrule.nodes = [];
                atrule.append(rule);
                container.inverse_root.append(atrule);
            } else {
                container.inverse_root.append(rule);
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
        if(rule.name == 'media' && (!rule.nodes || rule.nodes && !rule.nodes.length)) {
            rule.remove();
        }
    });
    if(opts.callback) {
        themes = _.map(themes, t => {
            if(t.root) {
                t.root = t.root.toString();
                if(opts.cleancss) {
                    try {
                        let result = new CleanCSS(opts.cleancss).minify(t.root);
                        t.root = result.styles;
                    } catch(e) {
                        console.log(e);
                    }
                }
            }
            if(t.inverse_root) {
                t.inverse_root = t.inverse_root.toString();
                if(opts.cleancss) {
                    try {
                        let result = new CleanCSS(opts.cleancss).minify(t.inverse_root);
                        t.inverse_root = result.styles;
                    } catch(e) {
                        console.log(e);
                    }
                }
            }
            return t;
        });
        opts.callback(themes);
    }
  }
});