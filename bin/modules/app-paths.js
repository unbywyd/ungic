let finder = require('find-nearest-file');
let path = require('path');
module.exports = function(p) {
    let cwd = process.cwd();
    let pathConfig = finder('ungic.config.json');
    let pathNpmConfig = finder('package.json');
    let root = cwd;
    if(pathNpmConfig) {
        root = path.dirname(pathNpmConfig);
    } else if(pathConfig) {
        root = path.dirname(pathConfig);
    }
    return {
        root,
        cwd,
        config: pathConfig,
        package: pathNpmConfig
    }
}