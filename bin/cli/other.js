const path = require('path');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');
const colors = require('colors');
const intro = require('../modules/add-files-to-project');
const open = require('open');

module.exports = function (yargs, done) {
  yargs
    .command('demo', 'Install demo content', args => {
    }, args => {
     done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let demoPath = path.join(__dirname, './demo');
          let scssPlugin = this.app.project.plugins.get('scss');
          try {
            await intro.call(this, async()=> {
              await scssPlugin.createComponent('ungic_icons');
              await scssPlugin.createComponent('myproject');
              await scssPlugin.createComponent('test');
              this.logger.log('Copying and processing files in progress, please wait');
              await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
              });
            });
            this.logger.system('Done! All files have been successfully added to your source directory and precompiled', 'CLI', 'success');
            open(app.fastify.address + '/demo');
          } catch(e) {
            this.logger.system(e, 'CLI');
          }
          done();
        });
      });
    })
    .command('boilerplate', 'Install boilerplate components', args => {
    }, args => {
     done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let scssPlugin = this.app.project.plugins.get('scss');
          let sourcePath1 = path.join(__dirname, './icons-page');
          let sourcePath2 = path.join(__dirname, './get-started');
          try {
            await intro.call(this, async()=> {
              this.logger.log('Copying and processing files in progress, please wait', 'CLI');
              try {
                await scssPlugin.createComponent('ungic_icons');
              } catch(e) {
                // console.log(e);
              }
              await scssPlugin.createComponent('grid');
              await scssPlugin.createComponent('app');
              await scssPlugin.createComponent('normalize');
              await scssPlugin.createComponent('utils');
              await fse.copy(sourcePath1, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
              });
              await fse.copy(sourcePath2, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
              });
            });
            this.logger.system('Done! All files have been successfully added to your source directory and precompiled', 'CLI', 'success');
          } catch(e) {
            this.logger.system(e, 'CLI');
          }
          done();
        });
      });
    })
    .command('bootstrap', 'Get started with bootstrap', args => {
    }, args => {
      done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let scssPlugin = this.app.project.plugins.get('scss');
          let htmlPlugin = this.app.project.plugins.get('html');
          let sourcePath1 = path.join(__dirname, './icons-page');
          let sourcePath2 = path.join(__dirname, './bootstrap');

          this.logger.system(colors.yellow.bold("Note") + ', for work with bootstrap, your ungic project must have the bootstrap package installed. To install the '+colors.yellow.bold("bootstrap package")+', use '+colors.yellow.bold('npm i bootstrap')+' command from your project directory.', 'CLI', 'warning');
          let answers = await prompts.call(this, [{
            type: 'confirm',
            name: 'confirm',
            default: false,
            message: `Note! Make sure bootstrap has been installed in your working directory of the ungic project! Do you want to continue?`
          }]);
          if(!answers.confirm) {
            return done();
          }

          try {
            await intro.call(this, async()=> {
              this.logger.log('Copying and processing files in progress, please wait', 'CLI');
              try {
                await scssPlugin.createComponent('ungic_icons');
              } catch(e) {
                // console.log(e);
              }
              await scssPlugin.createComponent('bootstrap');
              await fse.copy(sourcePath1, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
              });
              await fse.copy(sourcePath2, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
              });
            });
            this.logger.system('Done! All files have been successfully added to your source directory and precompiled.', 'CLI', 'success');
          } catch(e) {
            this.logger.system(e, 'CLI');
          }
          done();
        });
      });
    })
    .argv
}