const path = require('path');
const fse = require('fs-extra');
const AppPaths = require('../../modules/app-paths');
const _ = require('underscore');
const prompts = require('../../modules/prompt.js');
const intro = require('../../modules/add-files-to-project');
const open = require('open');

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
    scssPlugin.unwatch();
    
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
            scssPlugin.watch();
            scssPlugin.rebuild(['app', 'grid', 'normalize', 'utils']);
        });
        this.logger.system('Done! All files have been successfully added to your source directory and were processed', 'CLI', 'success');
        open(app.fastify.address + '/');
    } catch(e) {
        scssPlugin.watch();
        this.logger.system(e, 'CLI');
    }  
}

module.exports.bootstrap = async function(opts={}) {
    let hasBootstrap = false;
    let v = opts.v || '';
    let app = this.app;
       
    
    let appPaths = AppPaths();
    if(appPaths.node_modules) {
        hasBootstrap = await fse.pathExists(path.join(appPaths.node_modules, 'bootstrap'));
    }       
     
    if(!hasBootstrap && v != 4) {
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
    
    let scssPlugin = this.app.project.plugins.get('scss');
    let sourcePath = path.join(__dirname, '../install_packages/bootstrap' + v);
    scssPlugin.unwatch();

    try {
      await intro.call(this, async()=> {
        this.logger.log('Copying and processing files in progress, please wait', 'CLI');

        try {
            await scssPlugin.createComponent('app');
        } catch(e) {

        }
        await scssPlugin.createComponent('bootstrap');

        let dirs = this.app.config.fs.source;            
        for(let [dir, ph] of Object.entries(dirs)) {
            if(await fse.pathExists(path.join(sourcePath, dir))) {
                await fse.copy(path.join(sourcePath, dir), path.join(app.project.root, app.project.fsDirs('source'), ph), {
                    overwrite: true
                });
            } 
        }
        scssPlugin.watch();
        scssPlugin.rebuild(['app', 'bootstrap']);
      });
      this.logger.system('Done! All files have been successfully added to your source directory and were processed.', 'CLI', 'success');
      open(app.fastify.address + '/');
    } catch(e) {
        scssPlugin.watch();  
      this.logger.system(e, 'CLI');
    }
}

module.exports.bootstrapVue = async function(opts={}) {
    if(!opts.silence) {
        let answers = await prompts.call(this, [{
            type: 'confirm',
            name: 'install',
            message: `Do you want to install a bootstrap vue project?`
        }]);
        if(!answers || (answers && !answers.install)) {
            this.logger.warning('Action canceled', 'CLI');
            return
        }
    }
    let app = this.app;
    let scssPlugin = this.app.project.plugins.get('scss');
    scssPlugin.unwatch();

    let sourcePath = path.join(__dirname, '../install_packages/bootstrap-vue');
    
    try {
      await intro.call(this, async()=> {
        this.logger.log('Copying and processing files in progress, please wait', 'CLI');

        try {
            await scssPlugin.createComponent('app');
        } catch(e) {

        }
        await scssPlugin.createComponent('bootstrap-vue');

        let dirs = this.app.config.fs.source;            
        for(let [dir, ph] of Object.entries(dirs)) {
            if(await fse.pathExists(path.join(sourcePath, dir))) {
                await fse.copy(path.join(sourcePath, dir), path.join(app.project.root, app.project.fsDirs('source'), ph), {
                    overwrite: true
                });
            } 
        }
        scssPlugin.watch();
        scssPlugin.rebuild(['app', 'bootstrap-vue']);
      });
      this.logger.system('Done! All files have been successfully added to your source directory and were processed.', 'CLI', 'success');
      open(app.fastify.address + '/');
    } catch(e) {
      scssPlugin.watch();  
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
    scssPlugin.unwatch();
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
            scssPlugin.watch();
            scssPlugin.rebuild(['app', 'grid', 'normalize', 'utils']);
        });
        this.logger.system('Done! All files have been successfully added to your source directory and were processed', 'CLI', 'success');
        open(app.fastify.address + '/');
    } catch(e) {
        scssPlugin.watch();
        this.logger.system(e, 'CLI');
    }
}