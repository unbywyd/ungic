const postcss = require('postcss');
const _ = require('underscore');
const extractor = require('css-color-extractor');
module.exports = postcss.plugin('ungic-theme', function (opts) {
  opts = opts || {}
  return function (root, result) {
    let regexp = /^\.un-inverse|^\.un-theme/;

    let parseRule = rule => {
        let props = {
            'background': 'background-color',
            'border': 'border-color',
            'outline': 'outline-color'
        };

        let propertiesToSave = [
            'background',
            'background-image',
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
            'stroke',
            'fill',
            'color',
            'outline',
            'outline-color',
            'text-shadow',
            'box-shadow'
        ]
        if('string' == typeof rule.selector && regexp.test(rule.selector)) {
            let saveProps, saveInverseProps;

            // +
            if(rule.selector.indexOf('[un-save-props]') != -1) {
                rule.selector = rule.selector.replace(/\[un-save-props\]/gm, '');
                saveProps = true;
            }
            if(rule.selector.indexOf('[un-save-inverse-props]') != -1) {
                rule.selector = rule.selector.replace(/\[un-save-inverse-props\]/gm, '');
                saveInverseProps = true;
            }

            if(rule.selector.indexOf('[un-inverse-ignore]') != -1) {
                if(rule.selector.indexOf('.un-inverse') != -1) {
                    rule.remove();
                } else {
                    rule.selector = rule.selector.replace(/\[un-inverse-ignore\]/gm, '');
                }
                return
            }

            if(rule.selector.indexOf('[un-prefix') != -1) {
                rule.selector = rule.selector.split(/,\s+/).map(s => {
                    let regexp = /\[un-prefix=(?:'|")?\{\{(.+)\}\}(?:'|")?\]/;
                    let search = s.match(regexp);
                    let regexpTheme =  /(^\.un-theme-[^\s]+)\s+\[un-prefix=(?:'|")?\{\{(.+)\}\}(?:'|")?\]/;
                    if(regexpTheme.test(s)) {
                        search = s.match(regexpTheme);
                        let selector = search[2];
                        if(selector.indexOf(':') != -1) {
                            selector = ':' + selector.split(':')[1];
                        }
                        s = s.replace(search[0], search[1] + selector);
                    } else {
                        s = s.replace(regexp, search[1]);
                    }
                }).join(',');
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
                if (decl.prop) {
                    let prop = decl.prop;
                    let colors = extractor.fromDecl(decl);
                    if(!colors.length) {
                        if(propertiesToSave.indexOf(prop) == -1 && prop.indexOf('color') == -1) {
                            decl.remove();
                        }
                    }
                }
                if(!rule.nodes.length) {
                    rule.remove();
                }
            });

        } else {
            if(rule.selector.indexOf('[un-save-props]') != -1) {
                rule.selector = rule.selector.replace(/\[un-save-props\]/gm, '');
            }
            if(rule.selector.indexOf('[un-inverse-ignore]') != -1) {
                rule.selector = rule.selector.replace(/\[un-inverse-ignore\]/gm, '');
            }
            if(rule.selector.indexOf('[un-prefix') != -1) {
                let regexp = /\[un-prefix=(?:'|")?\{\{(.+)\}\}(?:'|")?\]/;
                rule.selector = rule.selector.split(/,\s+/).map(selector => {
                    let search = selector.match(regexp);
                    return selector.replace(regexp, search[1]);
                }).join(',');
            }
        }
    }
    root.walkRules(function(rule) {
        parseRule(rule);
        let regexp = /^.un-(theme|inverse)([^\s]+)?\s+html/gm;
        if(regexp.test(rule.selector)) {
            rule.selector = rule.selector.split(/,\s+/).map(s => {
                return s.replace(regexp, function(m) {
                    if(/^html/.test(m)) {
                        return m.replace(/html$/gm, '');
                    } else {
                        return 'html' + m.replace(/html$/, '');
                    }
                });
            }).join(', ');
        }

        if(/html:not/gm.test(rule.selector)) {
            rule.selector = rule.selector.split(/,\s+/).map(function(s) {
                return s.replace(/(?!^)\s+?html:not/gm, ':not');
            }).join(',');
        }
    });

    root.walkAtRules(function(rule) {
        if(rule.parent && ('string' == typeof rule.parent.selector && regexp.test(rule.parent.selector))) {
            rule.remove();
        }
    });
  }
});