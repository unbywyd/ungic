let finder = require('./finder');
let fs = require('fs');
let path = require('path');
const { config } = require('yargs');
module.exports = function(onlyRoot) {
    let cwd = process.cwd();
    let pathConfig, pathNpmConfig;
    let root = cwd;

    pathConfig = fs.existsSync(path.join(cwd, 'ungic.config.json')) ? path.join(cwd, 'ungic.config.json') : false;
    pathNpmConfig = fs.existsSync(path.join(cwd, 'package.json')) ? path.join(cwd, 'package.json') : false;

    if(!onlyRoot) {
        if(!pathConfig) {
            pathConfig = finder('ungic.config.json');
        }
        if(!pathNpmConfig) {
            pathNpmConfig = finder('package.json');
        }
    }

    if(pathConfig) {
        root = path.dirname(pathConfig);
    } else if(pathNpmConfig) {
        root = path.dirname(pathNpmConfig);
    }
    let node_modules = null;
    if(pathNpmConfig) {
        node_modules = path.join(path.dirname(pathNpmConfig), 'node_modules');
    } else {
        let tempPackage = finder('package-lock.json');
        if(tempPackage) {
            node_modules = path.join(path.dirname(tempPackage), 'node_modules');
        }
    }
    return {
        root,
        cwd,
        node_modules,
        config: pathConfig,
        package: pathNpmConfig
    }
}