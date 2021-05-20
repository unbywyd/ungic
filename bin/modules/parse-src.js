const isRelative = require('./is-relative');
const path = require('path');

const fs = require('fs');

/*
*   @relativeDist - настоящий путь директории в проекте, от которой требуется отталкиваться (opts.relativeDist)
*   @virtualRelativeDist - виртуальный путь директории, от которой требуется отталкиваться (relativeDist)  
*/
module.exports = function({src, virtualRelativeDist, relativeDist, dist, assets, urlsOptimization, releaseDistPath}) {
    let output = {
        isRelative: false,
        originalSrc: src,
        originalUrl: src.replace(/\\+/g, '/'),
        releaseDistPath
    }
    if(isRelative(src)) {  
        output.isRelative = true;
        /*
        *   Проверяем не выходит ли наш файл за рамки проекта относительно "виртуальной директории".
        */                          
        if(path.normalize(path.join(dist, virtualRelativeDist, src)).indexOf(path.normalize(dist)) == -1) {
            if(!urlsOptimization) {                                
                return output;
            }
            /*
            *   Посчитаем максимально возможный "задний ход"
            */
            let maxToBack = path.normalize(virtualRelativeDist.replace(/^([\\\/]+)|([\\\/]+)$/gm, '')).split(path.sep).map(() => '..').join(path.sep);                    
            src = path.join(maxToBack, src.replace(/(^[.\\\/]+)/g, '')).replace(/\\+/g, '/');        
            output.optimizedSrc = src;
            output.originalSrcPath = path.join(assets, relativeDist, output.originalSrc);
        }

        /*
        *   Относительный оригинальный путь до файла.
        */
        sourceRelativeSRC = path.join(path.sep, (/(^[\\\/]+)/.test(output.originalSrc) ? '' : relativeDist), src).replace(/\\+/g, '/');

        output.sourceRelativeSRC = sourceRelativeSRC;

        /*
        *   Полученная ссылка для возврата относительно проекта.
        */
        let virtualRelativeRootSrc = path.join(path.sep, (/(^[\\\/]+)/.test(output.originalSrc) ? '' : virtualRelativeDist), src).replace(/\\+/g, '/');

        output.virtualRelativeRootSrc = virtualRelativeRootSrc;

        let assetsPath = path.join(assets, sourceRelativeSRC), 
            sourceDistPath = path.join(dist, sourceRelativeSRC),
            outputReleaseDistPath = releaseDistPath ? path.join(releaseDistPath, sourceRelativeSRC) : false;
       

        if(!output.originalSrcPath) {
            output.originalSrcPath = assetsPath;
        }

        if(outputReleaseDistPath) {
            output.existsInRelease = fs.existsSync(outputReleaseDistPath);
            output.outputReleaseDistPath = outputReleaseDistPath;
        }
        if(fs.existsSync(output.originalSrcPath)) {                                   
            output.sourceFile = output.originalSrcPath;
        } else if(fs.existsSync(sourceDistPath)) {
            output.sourceFile = sourceDistPath;
        }
        return output;     
    } else {
        return output;
    }
}