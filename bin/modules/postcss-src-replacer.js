const postcss = require('postcss');
const fse = require('fs-extra');
const fs = require('fs');
const isRelative = require('./is-relative');
const path = require('path');
const url = require('url');

module.exports = postcss.plugin('ungic-src-replacer', function (opts) {
    opts = opts || {};
    return function (root, result) {
        let regexps = [
            /(url\(\s*(?:'|")?)([^'")]+)((?:'|")?\s*\))/g,
            /(AlphaImageLoader\(\s*src=['"]?)([^"')]+)(["'])/g
        ]
        root.walkDecls((decl) => {
            let regexp = regexps.find(regexp => decl.value.search(regexp) != -1);
            if(regexp) {
                decl.value = decl.value.replace(regexp, function(str, before, src, after) {
                   if(isRelative(src)) {
                        let releaseDistPath = path.join(opts.distPath, src), sourceDistPath = path.join(opts.dist, src);
                        try {
                            // Если файла нет в релизе, копируем в релиз
                            if(!fs.existsSync(releaseDistPath) && fs.existsSync(sourceDistPath)) {
                                fse.copySync(sourceDistPath, releaseDistPath);
                            }
                            // Если хост указан как внешняя ссылка, то заменяем локальный путь на ссылку
                            if(opts.release.host && !isRelative(opts.release.host)) {
                                return `${before}${url.resolve(opts.release.host, src)}${after}`;
                            } else {
                                return `${before}${src.replace(/^(\.{2}(\/|\\))+/, '/')}${after}`;
                            }
                        } catch(e) {
                            console.log(e);
                        }
                   }
                });
            }
        });
    }
});