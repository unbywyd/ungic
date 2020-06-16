let finder = require('find-nearest-file');
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
    return {
        root,
        cwd,
        config: pathConfig,
        package: pathNpmConfig
    }
}