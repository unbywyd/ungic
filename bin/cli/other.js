const path = require('path');
const inquirer = require('inquirer');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('underscore');
const Collector = require('../modules/collector.js');
const prompts = require('../modules/prompt.js');
module.exports = function(yargs, done) {
   yargs
    .command('install_demo', 'Install demo content', args => {
    }, args => {
        let app = this.app;
        let demoPath = path.join(__dirname, '../demo');
        let scssPlugin = this.app.project.plugins.get('scss');
        let htmlPlugin = this.app.project.plugins.get('html');
        let iconsPlugin = this.app.project.plugins.get('icons');
        scssPlugin.renderMaster.pause();
        htmlPlugin.renderMaster.pause();
        iconsPlugin.renderMaster.pause();
        let collector = new Collector({
            timeout: 2000
        });
        (async()=>{
            try {
                let created = await scssPlugin.createComponent('icons');
            } catch(e) {
                done(e);
                return
            }
            this.log('Copying files ...', 'Note');
            await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite:true
            });
            scssPlugin.renderMaster.collector.on('finish', events => {
                collector.add(events);
            });
            htmlPlugin.renderMaster.collector.on('finish', events => {
                collector.add(events);
            });
            iconsPlugin.renderMaster.collector.on('finish', events => {
                collector.add(events);
            });
            collector.on('finish', () => {
                this.log('The files were copied successfully, need to rebuild the project, wait until the end!', 'Note');
                prompts.call(this, [
                    {
                        type: 'confirm',
                        name: 'next',
                        message: 'Ok'
                    }
                ]).then(async e=> {
                    if(e.next) {
                        scssPlugin.renderMaster.pause(false);
                        htmlPlugin.renderMaster.pause(false);
                        iconsPlugin.renderMaster.pause(false);
                        await iconsPlugin.renderMaster.run();
                        await scssPlugin.renderMaster.run();
                        await htmlPlugin.renderMaster.run();
                        done('Done!');
                    } else {
                        done('Action canceled');
                    }
                });
            });
        })();
    })
    .command('create_config', 'Generate configuration file', args => {
    }, args => {
        let app = this.app;
        let filePath = path.join(app.project.root, 'ungic.config.json');
        if(fs.existsSync(filePath)) {
            done('Config already exist');
            return
        }

        let config = app.config;
        for(let plugin in config.plugins) {
            config.plugins[plugin] = {}
        }
        if(fs.existsSync(path.join(app.project.root, 'package.json'))) {
            delete config.name;
            delete config.version;
            delete config.author;
        }
        delete config.port;
        fse.outputFileSync(filePath, JSON.stringify(config, null, 4));
        done('Done!');
    })
    .argv;
}