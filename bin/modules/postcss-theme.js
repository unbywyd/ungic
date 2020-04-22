const postcss = require('postcss');
const _ = require('underscore');
const extractor = require('css-color-extractor');
module.exports = postcss.plugin('ungic-theme', function (opts) {
  opts = opts || {}
  return function (root, result) {
    let regexp = /^\.un-inverse|^\.un-theme/;
    let selectors = new Map();

    root.walkRules(function(rule) {
        let props = {
            'background': 'background-color',
            'border': 'border-color',
            'border-top': 'border-top-color',
            'border-right': 'border-right-color',
            'border-bottom': 'border-bottom-color',
            'border-left': 'border-left-color',
            'outline': 'outline-color'
        };

        let allPropsWithColors = [
            'background',
            'background-color',
            'border',
            'border-color',
            'border-top',
            'border-left',
            'border-right',
            'border-bottom',
            'border-top-color',
            'border-left-color',
            'border-right-color',
            'border-bottom-color',
            'color',
            'outline',
            'outline-color',
            'text-shadow',
            'box-shadow'
        ]
        if('string' == typeof rule.selector && regexp.test(rule.selector)) { // (rule.selector.indexOf('.un-inverse') != -1 || rule.selector.indexOf('.un-theme') != -1)
            let saveProps, saveInverseProps;

            // +
            if(rule.selector.indexOf('[un-save-props]') != -1) {
                rule.selector = rule.selector.replace('[un-save-props]', '');
                saveProps = true;
            }
            if(rule.selector.indexOf('[un-save-inverse-props]') != -1) {
                rule.selector = rule.selector.replace('[un-save-inverse-props]', '');
                saveInverseProps = true;
            }

            if(rule.selector.indexOf('[un-inverse-ignore]') != -1) {
                if(rule.selector.indexOf('.un-inverse') != -1) {
                    rule.remove();
                } else {
                    rule.selector = rule.selector.replace('[un-inverse-ignore]', '');
                }
                return
            }

            if(rule.selector.indexOf('[un-prefix') != -1) {
                let regexp = /\[un-prefix=(?:'|")([^\]]+)(?:'|")\]/;
                let search = rule.selector.match(regexp);
                let regexpTheme = /(^\.un-theme-[^\s]+)\s+\[un-prefix=(?:'|")([^'"]+)(?:'|")\]/;
                if(regexpTheme.test(rule.selector)) {
                    search = rule.selector.match(regexpTheme);
                    let selector = search[2];
                    if(selector.indexOf(':') != -1) {
                        selector = ':' + selector.split(':')[1];
                    }
                    rule.selector = rule.selector.replace(search[0], search[1] + selector);
                } else {
                    rule.selector = rule.selector.replace(regexp, search[1]);
                }
            }

            /*  is-theme
            *   Сохраняем все проперти если нет инверсии
            *   Но если есть инверсия то удалятся проперти которые не относятся к цвету
            */

            if(saveProps && rule.selector.indexOf('.un-inverse') == -1) {
                return
            }

            /*
            *   is-inverse
            *   Сохранить все проперти если инверсия, но не тема
            */
            if(saveInverseProps && rule.selector.indexOf('.un-inverse') === 0 && (rule.selector.indexOf('.un-theme-') == -1)) {
                return
            }
            /**************************/

            /*
            *   Если is-inverse и is-theme, то сохраняем все
            */
            if(saveProps && saveInverseProps) {
                return
            }

            rule.walkDecls(decl => {
                //console.log(rule.selector);
                let originSelector = rule.selector.replace(/\.un-inverse\s*|\.un-theme-[^\s]+\s+|^[^:]+:not\(.un-inverse\)\s+/gm, '').trim();
                if (decl.prop) {
                    let prop = decl.prop;
                    let colors = extractor.fromDecl(decl);
                    if(!colors.length) {
                        if(allPropsWithColors.indexOf(prop) == -1 && prop.indexOf('color') == -1) {
                            decl.remove();
                        }
                    } else {
                        if(selectors.has(originSelector + '-' + decl.prop)) {
                            let originValue = selectors.get(originSelector + '-' + decl.prop);
                            if(originValue == decl.value) {
                                decl.remove();
                                return
                            }
                        }
                        selectors.set(originSelector + '-' + decl.prop, decl.value);

                        if(props[prop] && colors.length === 1) {
                            decl.prop = props[prop];
                            decl.value = colors[0];
                        }
                    }
                }
                if(!rule.nodes.length) {
                    rule.remove();
                }
            });

        } else {
            if(rule.selector.indexOf('[un-save-props]') != -1) {
                rule.selector = rule.selector.replace('[un-save-props]', '');
            }
            if(rule.selector.indexOf('[un-inverse-ignore]') != -1) {
                rule.selector = rule.selector.replace('[un-inverse-ignore]', '');
            }
            if(rule.selector.indexOf('[un-prefix') != -1) {
                let regexp = /\[un-prefix=(?:'|")([^\]]+)(?:'|")\]/;
                let search = rule.selector.match(regexp);
                rule.selector = rule.selector.replace(regexp, search[1]);
            }
            rule.walkDecls(decl => {
                if(decl.prop && allPropsWithColors.indexOf(decl.prop) != -1) {
                    let originSelector = rule.selector.replace(/^[^:]+:not\(.un-inverse\)\s+/gm, '').trim();
                    selectors.set(originSelector + '-' + decl.prop, decl.value);
                }
            });
        }
    });
    root.walkAtRules(function(rule) {
        if(rule.parent && ('string' == typeof rule.parent.selector && regexp.test(rule.parent.selector))) { // (rule.selector.indexOf('.un-inverse') != -1 || rule.selector.indexOf('.un-theme') != -1))
            rule.remove();
        }
    });
  }
});