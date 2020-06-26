const path = require('path');
const inquirer = require('inquirer');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const _ = require('underscore');
const Collector = require('../modules/collector.js');
const prompts = require('../modules/prompt.js');
module.exports = function (yargs, done) {
  yargs
    .command('install_demo', 'Install demo content', args => {
    }, args => {
     done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let demoPath = path.join(__dirname, './demo');
          let scssPlugin = this.app.project.plugins.get('scss');
          let htmlPlugin = this.app.project.plugins.get('html');
          let iconsPlugin = this.app.project.plugins.get('icons');
          scssPlugin.renderMaster.pause();
          htmlPlugin.renderMaster.pause();
          iconsPlugin.renderMaster.pause();
          let collector = new Collector({
            timeout: 2000
          });

          try {
            await scssPlugin.createComponent('icons');
            await scssPlugin.createComponent('myproject');
            await scssPlugin.createComponent('test');
          } catch (e) {
            return this.logger.error(e, 'CLI');
          }

          let spareMethod = setTimeout(() => {
            collector.add({});
          }, 2000);
          this.logger.log('Copy and process files, please wait');
          await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
            overwrite: true
          });
          function toCollect(events) {
            clearTimeout(spareMethod);
            collector.add(events);
          }
          scssPlugin.renderMaster.collector.on('finish', toCollect);
          htmlPlugin.renderMaster.collector.on('finish', toCollect);
          iconsPlugin.renderMaster.collector.on('finish', toCollect);
          let self = this;
          function toFinish() {
            self.logger.log('The files were copied successfully, the project will be reassembled');
            collector.off('finish', toFinish);
            scssPlugin.renderMaster.collector.off('finish', toCollect);
            htmlPlugin.renderMaster.collector.off('finish', toCollect);
            iconsPlugin.renderMaster.collector.off('finish', toCollect);
            setTimeout(async() => {
              scssPlugin.renderMaster.pause(false);
              htmlPlugin.renderMaster.pause(false);
              iconsPlugin.renderMaster.pause(false);
              await iconsPlugin.renderMaster.run();
              await scssPlugin.renderMaster.run();
              await htmlPlugin.renderMaster.run();
              self.logger.success('Done!', 'CLI');
              done();
            }, 200);
          }
          collector.on('finish', toFinish);
        });
      });
    })
    .command('boilerplate', 'Install boilerplate components', args => {
    }, args => {
     done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let scssPlugin = this.app.project.plugins.get('scss');
          let htmlPlugin = this.app.project.plugins.get('html');
          let sourcePath1 = path.join(__dirname, './icons-page');
          let sourcePath2 = path.join(__dirname, './get-started');
          scssPlugin.renderMaster.pause();
          htmlPlugin.renderMaster.pause();
          let collector = new Collector({
            timeout: 2000
          });
          try {
            await scssPlugin.createComponent('ungic_icons');
            await scssPlugin.createComponent('grid');
            await scssPlugin.createComponent('normalize');
            await scssPlugin.createComponent('utils');
          } catch (e) {
            return this.logger.error(e, 'CLI');
          }
          this.logger.log('Copy and process files, please wait', 'CLI');
          let spareMethod = setTimeout(() => {
            collector.add({});
          }, 2000);
          await fse.copy(sourcePath1, path.join(app.project.root, app.project.fsDirs('source')), {
            overwrite: true
          });
          await fse.copy(sourcePath2, path.join(app.project.root, app.project.fsDirs('source')), {
            overwrite: true
          });
          function toCollect(events) {
            clearTimeout(spareMethod);
            collector.add(events);
          }
          scssPlugin.renderMaster.collector.on('finish', toCollect);
          htmlPlugin.renderMaster.collector.on('finish', toCollect);
          let self = this;
          function toFinish() {
            self.logger.log('The files were copied successfully, need to rebuild the project, wait until the end!', 'CLI');
            collector.off('finish', toFinish);
            scssPlugin.renderMaster.collector.off('finish', toCollect);
            htmlPlugin.renderMaster.collector.off('finish', toCollect);
            setTimeout(async() => {
              scssPlugin.renderMaster.pause(false);
              htmlPlugin.renderMaster.pause(false);
              await scssPlugin.renderMaster.run();
              await htmlPlugin.renderMaster.run();
              self.logger.success('Done!');
              done();
            }, 200);
          }
          collector.on('finish', toFinish);
        });
      });
    })
    .command('create_config', 'Generate configuration file', args => {
    }, args => {
      done(async () => {
        let app = this.app;
        let filePath = path.join(app.project.root, 'ungic.config.json');
        if (fs.existsSync(filePath)) {
          return this.logger.warning('Config already exist', 'CLI');
        }
        let config = app.config;
        for (let plugin in config.plugins) {
          config.plugins[plugin] = {}
        }
        if (fs.existsSync(path.join(app.project.root, 'package.json'))) {
          delete config.name;
          delete config.version;
          delete config.author;
        }
        delete config.port;
        fse.outputFileSync(filePath, JSON.stringify(config, null, 4));
        this.logger.success('Done!', 'CLI');
      });
    })
    .argv;
}