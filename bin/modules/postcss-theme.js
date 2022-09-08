const postcss = require('postcss');
const _ = require('underscore');
const extractor = require('css-color-extractor');
module.exports = postcss.plugin('ungic-theme', function (opts) {
  opts = opts || {}
  return function (root) {
    let regexp = /(?<![(\["'])\.(un-inverse|un-theme)/;

    let clearRules = (rule) => {
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
            'border-block-end',
            'border-block-start',
            'border-top-right-radius',
            'border-top-left-radius',
            'border-bottom-left-radius',
            'border-bottom-right-radius',
            'border-inline-end',
            'border-inline-start',
            'stroke',
            'fill',
            'color',
            'outline',
            'outline-color',
            'text-shadow',
            'box-shadow'
        ]
        rule.walkDecls(decl => {
            if (decl.prop) {
                let prop = decl.prop;
                let colors = extractor.fromDecl(decl);
                 colors = _.reject(colors, c => parseInt(c) === 0);                
                if(!colors.length) {                    
                    // Проблема такая - из-за того что мод включен он удаляет все переменные, в деве это норм, в продакшене это не норм
                    if((!propertiesToSave.includes(prop) && prop.indexOf('color') == -1) || opts.themeColorsVarsMode) {      
                        if(!/^--/.test(decl.prop)) {
                            decl.remove();
                        } 
                    }
                }
            }
            if(!rule.nodes.length) {
                rule.remove();
            }
        });
        return rule;
    }

    /*function rgbFix(rule) {        
        rule.walkDecls(decl => {
            if (decl.prop) {
                if(/^var\(--ungic/.test(decl.value) && /-rgb/.test(decl.value)) {
                    decl.value = `rgba(${decl.value}, 1)`;
                }
            }
        });
    }*/

    let parseRule = rule => {   
        
        if(opts.themeColorsVarsMode) {
           //rgbFix(rule);
        }

        if('string' == typeof rule.selector && regexp.test(rule.selector)) {
            let saveProps, saveInverseProps, hasInverse = /(?<![(\["'])\.un-inverse/.test(rule.selector), customPrefix;

            if(rule.selector.indexOf('[un-save-props]') != -1) {
                rule.selector = rule.selector.replace(/\[un-save-props\]/gm, '');
                saveProps = true;
            }
            if(rule.selector.indexOf('[un-save-inverse-props]') != -1) {
                rule.selector = rule.selector.replace(/\[un-save-inverse-props\]/gm, '');
                saveInverseProps = true;
            }

            if(rule.selector.indexOf('[un-inverse-skip]') != -1) {
                if(hasInverse) {
                    rule.remove();
                } else {
                    rule.selector = rule.selector.replace(/\[un-inverse-skip\]/gm, '');
                }
                return
            }

            if(rule.selector.indexOf('[un-prefix') != -1) {
                //let customPrefix;
                rule.selector = rule.selector.split(/,\s*/).map(s => {
                    customPrefix = /un-custom-prefix-/.test(s);
                    s = s.replace(/un-custom-prefix-/gm, '');
                    let regexp = /\[un-prefix=(?:'|")?\{\{(.*)\}\}(?:'|")?\]/;
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
                    if(customPrefix) {
                        //clearRules(rule);
                        s = s.replace(/(?<![(\["'])\.un-inverse/gm, '');
                    }
                    return s;
                }).join(',');
            }

            /* 
            *   Сохраняем все проперти если нет инверсии
            *   Но если есть инверсия то удаляются проперти которые не относятся к цвету
            */

            if(saveProps && !hasInverse) {
                return
            }

                  
            // Если тема выносится в отдельный файл, тогда сохраняем пропертис (не цветовые), иначе удаляем
            if(saveInverseProps && hasInverse) {                
                if(rule.selector.indexOf('.un-theme-') == -1 || opts.inverseMode == 'external') {
                    return
                }
            }

            if(saveProps && saveInverseProps) {
                return
            }

            clearRules(rule);

        } else {
            if(rule.selector.indexOf('[un-save-props]') != -1) {
                rule.selector = rule.selector.replace(/\[un-save-props\]/gm, '');
            }
            if(rule.selector.indexOf('[un-inverse-skip]') != -1) {
                rule.selector = rule.selector.replace(/\[un-inverse-skip\]/gm, '');
            }
            if(rule.selector.indexOf('[un-prefix') != -1) {
                let regexp = /\[un-prefix=(?:'|")?\{\{(.*)\}\}(?:'|")?\]/;
                rule.selector = rule.selector.split(/,\s*/).map(selector => {
                    selector = selector.replace(/un-custom-prefix-/gm, '');
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
            rule.selector = rule.selector.split(/,\s*/).map(s => {
                return s.replace(regexp, function(m) {
                    if(/^html/.test(m)) {
                        return m.replace(/html$/gm, '');
                    } else {
                        return 'html' + m.replace(/html$/, '');
                    }
                });
            }).join(', ');
        }

          if(/(?<![(\["'])\.(un-inverse|un-theme-\w+)\s+:not/.test(rule.selector)) {
            rule.selector = rule.selector.split(/,\s*/).map(function(s) {
                return s.replace(/(?<![(\["'])\.(un-inverse|un-theme-\w+)\s+:not/, function(match) {                    
                    return match.replace(/\s+\:not/, ':not');
                })
            }).join(',');
        }

        if(rule.selector.indexOf('\.un-merge-method') != -1) {
            let regexp = /\s*\.un-merge-method/gmi;
            rule.selector = rule.selector.replace(regexp, '');
        }
    });

    root.walkAtRules(function(rule) {
        if(rule.parent && ('string' == typeof rule.parent.selector && regexp.test(rule.parent.selector))) {
            rule.remove();
        }
    });
  }
});