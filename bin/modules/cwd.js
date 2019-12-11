let finder = require('find-nearest-file');
module.exports = function(p) {
    let cwd = process.cwd();
    let pathConfig = finder('ungic.config.json');
    let pathNpmConfig = finder('package.json');
    let root = cwd;
    if(pathConfig) {
        root = pathConfig;
    } else if(pathNpmConfig) {
        root = pathNpmConfig;
    }
    return {
        root,
        cwd,
        config: pathConfig,
        package: pathNpmConfig
    }
}