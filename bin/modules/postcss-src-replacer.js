const postcss = require('postcss');
const fse = require('fs-extra');
const {urlJoin} = require('./url-join');
const parseSrc = require('./parse-src');
module.exports = postcss.plugin('ungic-src-replacer', function (opts) {
    opts = opts || {};
    return function (root) {
        let regexps = [
            /(url\(\s*(?:'|")?)([^'")]+)((?:'|")?\s*\))/g,
            /(AlphaImageLoader\(\s*src=['"]?)([^"')]+)(["'])/g
        ]
        root.walkDecls((decl) => {
            let regexp = regexps.find(regexp => decl.value.search(regexp) != -1);
            if(regexp) {
                let value = decl.value.replace(regexp, function(str, before, src, after) {       
                    let virtualRelativeDist = opts.virtualRelativeDist;
                    if(!virtualRelativeDist) {
                        virtualRelativeDist = opts.release.includeLocalStyles ? '' : (opts.relativeDist || '')
                    }
                    let data = parseSrc({
                        assets: opts.assets,
                        src,
                        dist: opts.dist,
                        relativeDist: opts.relativeDist,
                        releaseDistPath: opts.releaseDistPath,
                        virtualRelativeDist,
                        urlsOptimization: opts.release.urlsOptimization
                    });
                    if(data.isRelative) {
                        /*
                        *   Если файл не найден и требуется оптимизация удаляем правило
                        */
                        
                        //console.log(data);
                        if(!data.sourceFile && opts.release.urlsOptimization) {
                            if(opts.log) {
                                opts.log(`${src} resource not found and ${decl.prop} property will be removed`, 'warning');
                            }
                            return '';
                        } 

                        // Если файл имеется, и отсутствует в релизе, клонируем
                        if(data.sourceFile && !data.existsInRelease) {
                            fse.copySync(data.sourceFile, data.outputReleaseDistPath);
                        }    
                        
                        let host = opts.release.host || '';                     
                        if(opts.release.urlsOptimization || host != '') {   
                            //console.log(str, `${before}${urlJoin(host, data.virtualRelativeRootSrc)}${after}`);                                 
                            return `${before}${urlJoin(host, data.virtualRelativeRootSrc)}${after}`;
                        } else {
                            return str;
                        }

                    } else {
                        /*
                        *   Вернули внешние ссылки
                        */
                        return str;
                    }                    
                });

                if(!value || value == '') {                   
                    decl.remove();
                } else {
                    decl.value = value;
                }
            }
        });
    }
});

