const path = require('path');
const _ = require('underscore');
const fg = require('fast-glob');
const fse = require('fs-extra');
const fs = require('fs');
const prompts = require('../modules/prompt.js');
const iconsInquirer = require('./release/icons_inquirer');
const intro = require('../modules/add-files-to-project');

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
          this.logger.system(`Icons successfully saved as ${res}`, 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('switch <mode>', "Switch dev build mode of icons (Temporary switching, does not affect configuration)", args => {
    }, args => {
      done(async () => {
        let allow = ['fonts', 'svgSprite'];
        if(!allow.includes(args.mode)) {
          return this.logger.system(`${args.mode} mode not supported, supported modes: fonts or svgSprite`);
        }
        try {
          let iconsPlugin = this.app.project.plugins.get('icons');
          if(iconsPlugin.buildConfig.svgIconsMode == args.mode) {
            return this.logger.system(`${args.mode} is a real mode`);
          }
          iconsPlugin.buildConfig.svgIconsMode = args.mode;
          iconsPlugin.rebuild();
          this.logger.system(`Icons generation mode switched to ${args.mode}!`);
        } catch(e) {
          console.log(e);
        }
      });
    })
    .command('icons_page', 'Create page with all icons', args => {
    }, args => {
      done(() => {
        return new Promise(async(done, rej) => {
          let app = this.app;
          let scssPlugin = this.app.project.plugins.get('scss');
          let demoPath = path.join(__dirname, './icons-page');
          try {
            await intro.call(this, async()=> {
              this.logger.log('Copying and processing files in progress, please wait', 'CLI');
              await scssPlugin.createComponent('ungic_icons');
              await fse.copy(demoPath, path.join(app.project.root, app.project.fsDirs('source')), {
                overwrite: true
              });
            });
            this.logger.system('Done! ungic_icons page was added successfully to source directory and precompiled', 'CLI', 'success');
          } catch(e) {
            this.logger.system(e, 'CLI');
          }
          done();
        });
      });
    })
    .command('import [path]', 'Import svg from exported file (path relative to dist directory)', args => {
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
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('release <release_name> [build_name]', 'Release icons', yargs => {
        yargs.option('version', {
          alias: 'v',
          type: 'number',
          description: 'Release version'
        })
    }, args => {
      done(async () => {
          let plugin = this.app.project.plugins.get('icons');
          args.icons_build_name = args.build_name ? args.build_name : args.release_name;
          args.requestVersion = true;
          let release = await iconsInquirer.call(this, args);
          if(typeof release == 'object') {
            try {
              await plugin.release(release);
            } catch(e) {
              console.log(e);
              this.logger.system(e, 'CLI');
            }
          }
      });
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
      done((async () => {
        let plugin = this.app.project.plugins.get('icons');
        plugin.unwatch();
        this.logger.system('Watcher disabled', 'CLI');
      }))
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
      done((async () => {
        let plugin = this.app.project.plugins.get('icons');
        plugin.watch();
        this.logger.system('Watcher enabled', 'CLI');
      }));
    })
    .argv;
}