const path = require('path');
const _ = require('underscore');
const colors = require('colors');
const iconsInquirer = require('./release/icons_inquirer');

module.exports = function (yargs, done) {
  yargs
    .command('export [path]', 'export all svg icons to json', args => {
      args.option('ids', {
        alias: 'i',
        describe: 'ids of icons',
        type: 'array',
        default: []
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
    .command('svgmode [mode]', "Switch the mode of generating svg icons (svgIconsMode). This is a temporary action that will work until the project is restarted.", args => {
    }, args => {
      done(async () => {
        try {
          let iconsPlugin = this.app.project.plugins.get('icons');
          if(!args.mode) {
            return this.logger.system(`Active mode: ${iconsPlugin.buildConfig.svgIconsMode}`);
          }
          let allow = ['fonts', 'svgSprite'];
          if(!allow.includes(args.mode)) {
            return this.logger.system(`${args.mode} mode not supported, supported modes: fonts or svgSprite`);
          }
          if(iconsPlugin.buildConfig.svgIconsMode == args.mode) {
            return this.logger.system(`${args.mode} is a real mode`);
          }
          iconsPlugin.buildConfig.svgIconsMode = args.mode;
          let finish = () => {
            iconsPlugin.off('rendered', finish);
            iconsPlugin.emit('changeSvgMode', args.mode);
          }
          iconsPlugin.on('rendered', finish);
          iconsPlugin.rebuild();
          this.logger.system(`SVG icons generation mode switched to ${args.mode}!`);
        } catch(e) {
          console.log(e);
        }
      });
    })
    .command('search', 'Get icon data', yargs => {
      yargs.option('path', {
        type: 'string'
      });
      yargs.option('name', {
        type: 'string' 
      });
      yargs.option('sourcename', {
        type: 'string' 
      });
      yargs.option('id', {
        type: 'string' 
      });
    }, args => {
      done(() => {
        args = _.omit(args, '_', '$0');
        if(!Object.keys(args).length) {
          return this.logger.system('Parameters not specified, use search --help command to view supported parameters', 'CLI');
        }

        let iconsPlugin = this.app.project.plugins.get('icons');
        let icons = iconsPlugin.collection;
        if(!icons.size()) {
          return this.logger.system(`This project has no icons.`, 'CLI', 'warning');
        }
        icons = icons.toJSON();

        let found = _.where(icons, args);
        this.logger.system(`${colors.green.bold(found.length)} icons found for your request`, 'CLI');

        if(found.length) {
          return this.logger.system(_.map(found, i => (i.svg ? '[SVG]' : '[Image]') + ` sourcename: ${i.sourcename}, name: ${i.name}, ID: ${i.id}, path: ${i.path}`).sort().join('\n'), 'Icons list');
        }
      });
    })
    .command('icons [type]', 'Get list of icons. [type] = image|svg|*, * - by default', args => {
    }, args => {
      done(() => {
        let iconsPlugin = this.app.project.plugins.get('icons');
        let icons = iconsPlugin.collection;
        if(!icons.size()) {
          return this.logger.system(`This project has no icons.`, 'CLI', 'warning');
        }
        icons = icons.toJSON();
        if(args.type == 'svg') {
          icons = iconsPlugin.getIconsList(true);
        } else if(args.type == 'image') {
          icons = iconsPlugin.getIconsList(false);
        } else if(args.type) {
          this.logger.system(`${args.type} type not supported. Type must be image or svg.`, 'CLI', 'warning');
        }
        if(!icons.length) {
          return this.logger.system(`This project has no ${args.type} icons.`, 'CLI', 'warning');
        }

        return this.logger.system(_.map(icons, i => (i.svg ? '[SVG]' : '[Image]') + ` sourcename: ${i.sourcename}, name: ${i.name}, ID: ${i.id}, path: ${i.path}`).sort().join('\n'), 'Icons list');
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
          args.includeBuildConfig = true;
          let release = await iconsInquirer.call(this, args);
          if(typeof release == 'object') {
            try {
              this.logger.system(`Release build start, please wait...`);
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