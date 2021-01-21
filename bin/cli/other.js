const path = require('path');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');
const colors = require('colors');
const intro = require('../modules/add-files-to-project');
const open = require('open');
let {demo, boilerplate} = require('./modules/install_packages');

module.exports = function (yargs, done) {
  yargs
    .command('demo', 'Get started with demo project', () => {
    }, () => {
     done(demo.bind(this)); 
    })
    .command('boilerplate', 'Get started with boilerplate', () => {
    }, () => {
     done(boilerplate.bind(this));
    })
    .command('bootstrap', 'Get started with bootstrap', () => {
    }, () => {
      done(async() => {
        let answers = await prompts.call(this, [{
          type: 'confirm',
          name: 'install',
          message: `Do you want to install a bootstrap project?`
        }]);
        if(!answers || (answers && !answers.install)) {
          this.logger.warning('Action canceled', 'CLI');
          return
        }        
        let app = this.app;
        let scssPlugin = this.app.project.plugins.get('scss');
        let sourcePath = path.join(__dirname, './install_packages/bootstrap');

        this.logger.system(colors.yellow.bold("Note") + ', for work with bootstrap, your ungic project must have the bootstrap package installed. To install the '+colors.yellow.bold("bootstrap package")+', use '+colors.yellow.bold('npm i bootstrap')+' command from your project directory.', 'CLI', 'warning');
        answers = await prompts.call(this, [{
          type: 'confirm',
          name: 'confirm',
          default: false,
          message: `Note! Make sure bootstrap has been installed in your working directory of the ungic project! Do you want to continue?`
        }]);
        if(!answers.confirm) {
          return
        }
        try {
          await intro.call(this, async()=> {
            this.logger.log('Copying and processing files in progress, please wait', 'CLI');

            await scssPlugin.createComponent('app');
            await scssPlugin.createComponent('bootstrap');
            await fse.copy(sourcePath, path.join(app.project.root, app.project.fsDirs('source')), {
              overwrite: true
            });
          });
          this.logger.system('Done! All files have been successfully added to your source directory and were processed.', 'CLI', 'success');
          open(app.fastify.address + '/');
        } catch(e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .argv
}