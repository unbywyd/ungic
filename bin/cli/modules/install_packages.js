const path = require('path');
const fse = require('fs-extra');
const AppPaths = require('../../modules/app-paths');
const _ = require('underscore');
const prompts = require('../../modules/prompt.js');
const intro = require('../../modules/add-files-to-project');
const open = require('open');
const { fips } = require('crypto');
//const fg = require('fast-glob');

module.exports.demo = async function(opts={}) {
    if(!opts.silence) {
        let answers = await prompts.call(this, [{
            type: 'confirm',
            name: 'install',
            message: `Do you want to install a demo project?`
        }]);
        if(!answers || (answers && !answers.install)) {
            this.logger.warning('Action canceled', 'CLI');
            return
        }
    }
    let app = this.app;
    let scssPlugin = this.app.project.plugins.get('scss');

    let getStartedPath = path.join(__dirname, '../install_packages/get_started');
    let demoPath = path.join(__dirname, '../install_packages/demo');
    try {
        await intro.call(this, async()=> {
            this.logger.log('Copying and processing files in progress, please wait', 'CLI');         

            await scssPlugin.createComponent('grid');
            await scssPlugin.createComponent('app');
            await scssPlugin.createComponent('normalize');
            await scssPlugin.createComponent('utils');      

            let dirs = this.app.config.fs.source;
            
            for(let [dir, ph] of Object.entries(dirs)) {
                if(await fse.pathExists(path.join(getStartedPath, dir))) {
                    await fse.copy(path.join(getStartedPath, dir), path.join(app.project.root, app.project.fsDirs('source'), ph), {
                        overwrite: true
                    });
                } 
                if(await fse.pathExists(path.join(demoPath, dir))) {
                    await fse.copy(path.join(demoPath, dir), path.join(app.project.root, app.project.fsDirs('source'), ph), {
                        overwrite: true
                    });
                } 
            }
        });
        this.logger.system('Done! All files have been successfully added to your source directory and were processed', 'CLI', 'success');
        open(app.fastify.address + '/');
    } catch(e) {
        this.logger.system(e, 'CLI');
    }  
}

module.exports.bootstrap = async function(opts={}) {
    let hasBootstrap = false;
    
    let appPaths = AppPaths();
    if(appPaths.node_modules) {
        hasBootstrap = await fse.pathExists(path.join(appPaths.node_modules, 'bootstrap'));
    }        
 
    if(!hasBootstrap) {
        return this.logger.warning('In order to install this demo, you need to first install bootstrap in your project!');
    }
    if(!opts.silence) {
        let answers = await prompts.call(this, [{
            type: 'confirm',
            name: 'install',
            message: `Do you want to install a bootstrap project?`
        }]);
        if(!answers || (answers && !answers.install)) {
            this.logger.warning('Action canceled', 'CLI');
            return
        }
    }
    let app = this.app;
    let scssPlugin = this.app.project.plugins.get('scss');
    let sourcePath = path.join(__dirname, '../install_packages/bootstrap');
    
    try {
      await intro.call(this, async()=> {
        this.logger.log('Copying and processing files in progress, please wait', 'CLI');

        await scssPlugin.createComponent('app');
        await scssPlugin.createComponent('bootstrap');

        await fse.copy(sourcePath, path.join(app.project.root, app.project.fsDirs('source')), {
          overwrite: true
        });

        let dirs = this.app.config.fs.source;            
        for(let [dir, ph] of Object.entries(dirs)) {
            if(await fse.pathExists(path.join(sourcePath, dir))) {
                await fse.copy(path.join(sourcePath, dir), path.join(app.project.root, app.project.fsDirs('source'), ph), {
                    overwrite: true
                });
            } 
        }
      });
      this.logger.system('Done! All files have been successfully added to your source directory and were processed.', 'CLI', 'success');
      open(app.fastify.address + '/');
    } catch(e) {
      this.logger.system(e, 'CLI');
    }
}


module.exports.boilerplate = async function(opts={}) {
    if(!opts.silence) {
        let answers = await prompts.call(this, [{
            type: 'confirm',
            name: 'install',
            message: `Do you want to install a boilerplate project?`
        }]);
        if(!answers || (answers && !answers.install)) {
            this.logger.warning('Action canceled', 'CLI');
            return
        }
    }
    let app = this.app;
    let scssPlugin = this.app.project.plugins.get('scss');
    let sourcePath = path.join(__dirname, '../install_packages/get_started');
    try {
        await intro.call(this, async()=> {
            this.logger.log('Copying and processing files in progress, please wait', 'CLI');         
        
            await scssPlugin.createComponent('grid');
            await scssPlugin.createComponent('app');
            await scssPlugin.createComponent('normalize');
            await scssPlugin.createComponent('utils');      

            let dirs = this.app.config.fs.source;
            
            for(let [dir, ph] of Object.entries(dirs)) {
                if(await fse.pathExists(path.join(sourcePath, dir))) {
                    await fse.copy(path.join(sourcePath, dir), path.join(app.project.root, app.project.fsDirs('source'), ph), {
                        overwrite: true
                    });
                } 
            }
        });
        this.logger.system('Done! All files have been successfully added to your source directory and were processed', 'CLI', 'success');
        open(app.fastify.address + '/');
    } catch(e) {
        this.logger.system(e, 'CLI');
    }
}