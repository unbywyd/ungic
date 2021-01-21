const path = require('path');
const fse = require('fs-extra');
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
    let getStartedPath = path.join(__dirname, '../install_packages/get_started');
    let demoPath = path.join(__dirname, '../install_packages/demo');
    try {
        await intro.call(this, async()=> {
            this.logger.log('Copying and processing files in progress, please wait', 'CLI');         

            await scssPlugin.createComponent('grid');
            await scssPlugin.createComponent('app');
            await scssPlugin.createComponent('normalize');
            await scssPlugin.createComponent('utils');      

            await fse.copy(getStartedPath, path.join(app.project.root, app.project.fsDirs('source')), {
            overwrite: true
            });
            await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
            overwrite: true
            });
        });
        this.logger.system('Done! All files have been successfully added to your source directory and were processed', 'CLI', 'success');
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

            await fse.copy(sourcePath, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
            });
        });
        this.logger.system('Done! All files have been successfully added to your source directory and were processed', 'CLI', 'success');
        open(app.fastify.address + '/');
    } catch(e) {
        this.logger.system(e, 'CLI');
    }
}