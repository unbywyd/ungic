const path = require('path');
const inquirer = require('inquirer');
const fg = require('fast-glob');
const _ = require('underscore');
const fse = require('fs-extra');
const fs = require('fs');
const prompts = require('../modules/prompt.js');
const Collector = require('../modules/collector.js');

module.exports = function (yargs, done) {
  yargs
    .command('export', 'export all svg to json', args => {
      args.option('ids', {
        alias: 'i',
        describe: 'ids of icons',
        type: 'array',
        default: []
      });
      args.option('path', {
        alias: 'p',
        describe: 'file path relative to dist directory',
        type: 'string'
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('icons');
        try {
          let res = await plugin.exportIcons(args['ids'], args.path);
          this.logger.success(`Icons successfully saved as ${res}`, 'CLI');
        } catch (e) {
          this.logger.error(e, 'CLI');
        }
      });
    })
    .command('html_page', 'Create page with all icons', args => {

    }, args => {
      done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let scssPlugin = this.app.project.plugins.get('scss');
          let htmlPlugin = this.app.project.plugins.get('html');
          let demoPath = path.join(__dirname, './icons-page');
          scssPlugin.renderMaster.pause();
          htmlPlugin.renderMaster.pause();
          let collector = new Collector({
            timeout: 2000
          });
          try {
            await scssPlugin.createComponent('ungic_icons');
          } catch (e) {
            return this.logger.error(e, 'CLI');
          }
          this.logger.log('Copy and process files, please wait', 'CLI');
          let spareMethod = setTimeout(() => {
            collector.add({});
          }, 2000);
          await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
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
    .command('import', 'Import svg from exported file', args => {
      args.option('path', {
        alias: 'p',
        describe: 'file path relative to dist directory',
        type: 'string'
      });
      args.option('save', {
        alias: 's',
        describe: 'Save to svg files (Note! This method work with the replacement of the previous svg files)',
        type: 'boolean'
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('icons');
        try {
          await plugin.importIcons(args.path, args.save);
          this.logger.log(`Icons successfully imported to project`, 'CLI');
        } catch (e) {
          this.logger.error(e, 'CLI');
        }
      });
    })
    .command('release <release_name>', 'Release icons', args => {
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('icons');
        let questionsFirstStep = [{
          type: 'list',
          name: 'type',
          message: `Release type`,
          validate: v => v.replace(/\s+/, '') !== '',
          choices: [{
            value: 'sprites',
            name: 'Image sprite'
          },
          {
            value: 'fonts',
            name: 'Fonts'
          },
          {
            value: 'svg_sprites',
            name: 'Svg sprites'
          }]
        },
        {
          type: 'list',
          name: 'selection_method',
          message: `Icon selection method`,
          validate: v => v.replace(/\s+/, '') !== '',
          choices: ['Glob', 'Choose icons']
        }];

        try {
          let answersFirstStep = await prompts.call(this, questionsFirstStep);
          let onlySvg = answersFirstStep.type != 'sprites';
          let iconsType = answersFirstStep.type;
          let icons = [];
          if (answersFirstStep.selection_method == 'Choose icons') {
            try {
              let allIcons = plugin.getIconsList(onlySvg);
              let iconsList = _.pluck(allIcons, 'id');
              if (!iconsList.length) {
                return this.logger.warning('No icons found', 'cli');
              }
              let requestIcons = await prompts.call(this, [{
                type: 'checkbox',
                name: 'icons',
                message: `Choose icons`,
                choices: iconsList
              }]);
              if (!requestIcons.icons.length) {
                return this.logger.warning('No icons selected', 'cli');
              }
              icons = plugin.collection.filter(model => requestIcons.icons.indexOf(model.get('id')) != -1);
            } catch (e) {
              return this.logger.error(e, 'cli');
            }
          } else {
            let globPath = await prompts.call(this, [{
              type: 'input',
              name: 'glob',
              message: `Please input glob path relative to the source icons folder`,
              default: onlySvg ? '**/*.svg' : '**/*.png',
              validate: v => v.replace(/\s+/, '') !== ''
            }]);

            try {
              let entries = await fg(globPath.glob, {
                cwd: plugin.root
              });
              if (!entries.length) {
                return this.logger.warning('No icons found', 'CLI');
              }
              let pathes = _.map(entries, p => path.normalize(p));
              icons = plugin.collection.filter(m => {
                if (pathes.indexOf(path.normalize(m.get('path'))) != -1) {
                  if (onlySvg && m.has('svg') || !onlySvg && !m.has('svg')) {
                    return m;
                  }
                }
              });
              if (!icons.length) {
                return this.logger.warning('No matching icons', 'CLI');
              }
            } catch (e) {
              return this.logger.error(e, 'CLI');
            }
          }
          // icons
          let questions = [{
            type: 'input',
            name: 'version',
            default: '0.0.1',
            message: `Release version`,
            validate: v => v.replace(/\s+/, '') !== ''
          }];

          let answers = await prompts.call(this, questions);
          if (!answers) {
            return this.logger.warning('Action canceled', 'CLI');
          }
          answers.type = iconsType;
          answers.name = args.release_name;
          await plugin.release(answers, icons);
          this.logger.success('Done!', 'CLI');
        } catch (e) {
          this.logger.error(e, 'CLI');
        }
      });
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
      done((async () => {
        let plugin = this.app.project.plugins.get('icons');
        plugin.unwatch();
        this.logger.success('Watcher skipped', 'CLI');
      }))
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
      done((async () => {
        let plugin = this.app.project.plugins.get('icons');
        plugin.watch();
        this.logger.success('Watcher enabled', 'CLI');
      }));
    })
    .argv;
}