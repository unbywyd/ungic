const _ = require('underscore');
const prompts = require('../modules/prompt.js');
const moment = require('moment');

module.exports = function (yargs, done) {
  yargs
    .command('create <cid>', 'Create new component', args => {
      args.positional('cid', {
        describe: 'a unique identifier for component id',
        type: 'string'
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        try {
          await plugin.createComponent(args.cid);
          this.logger.success(`${args.cid} component successfully created!`, 'CLI');
        } catch (e) {
          this.logger.error(e, 'CLI');
        }
      });
    })
    .command('release <release_name>', 'Assemble components in a release', yargs => {
      return yargs.option('name', {
        type: 'string',
        description: 'Release name'
      })
        .option('inv', {
          type: 'boolean',
          description: 'Generate inverse version'
        })
        .option('definv', {
          type: 'boolean',
          description: 'Inversion by default'
        })
        .option('tmode', {
          type: 'string',
          description: 'Theme mode (external or combined)'
        })
        .option('invmode', {
          type: 'string',
          description: 'Inverse mode (external or combined)'
        })
        .option('autoprefixer', {
          type: 'boolean',
          alias: 'ap',
          description: 'Autoprefixer'
        })
        .option('dir', {
          type: 'boolean',
          description: 'Direction LTR or RTL or boolean (false to ignore rtl plugin)'
        })
        .option('odir', {
          type: 'boolean',
          description: 'Opposite direction'
        })
        .option('version', {
          alias: 'v',
          type: 'number',
          description: 'Release version'
        })
        .option('theme', {
          alias: 't',
          type: 'string',
          description: 'Default theme'
        })
    }, args => {      
      done(async () => {       
        let plugin = this.app.project.plugins.get('scss');
        let components = [];
        let build = plugin.builder.config;
        let releaseConfigs = build.release.configs;
        let releaseBuilds = build.release.build;

        if (!releaseBuilds[args.release_name]) {
          this.logger.warning(`Default configuration will be used because ${args.release_name} release build scheme configuration not specified in build_schemes.`, 'CLI');
        }

        let config = Object.assign({}, releaseConfigs.default);
        let hasBuildName = !!(releaseBuilds[args.release_name]);

        if (hasBuildName) {
          let config_id = releaseBuilds[args.release_name].config_id;
          if (!releaseConfigs[config_id]) {
            this.logger.warning(`${config_id} config_id is not specified in release configs. Default configuration will be used.`, 'CLI');
          } else {
            config = _.extend(config, releaseConfigs[config_id]);
          }
        }

        let release = hasBuildName ? releaseBuilds[args.release_name] : {
          config_id: "default",
          default_theme: 'default',
          version: '0.0.1'
        }

        release.name = args.name ? args.name : args.release_name;

        if (!release.name) {
          release.name = moment().unix();
        }

        if ("version" in args) {
          release.version = args.version;
        }
        if ("theme" in args) {
          release.default_theme = args.theme;
        }
        if ("inv" in args) {
          config.inverse = args.inv;
        }
        if ("definv" in args) {
          config.default_inverse = args.definv;
        }
        if ("tmode" in args) {
          if (["combined", "external"].indexOf(args.tmode) == -1) {
            return this.logger.error('Theme mode must be "combined" or "external"', 'CLI');
          }
          config.theme_mode = args.tmode;
        }
        if ("invmode" in args) {
          if (["combined", "external"].indexOf(args.invmode) == -1) {
            return this.logger.error('Inverse mode must be "combined" or "external"', 'CLI');
          }
          config.inverse_mode = args.invmode;
        }
        if ("autoprefixer" in args) {
          config.autoprefixer = args.autoprefixer;
        }
        if ("dir" in args) {
          config.direction = args.dir;
        }
        if ("odir" in args) {
          config.opposite_direction = args.odir;
        }       
        let reConfigRequest = await prompts.call(this, [{
          type: 'confirm',
          message: hasBuildName ? 'You want to reconfigure release scheme configuration?' : 'You want to reconfigure default configuration?',
          name: 'config',
          default: false
        }]);


        args.config = reConfigRequest.config;
        let cids = await plugin.getComponents();
        let themes = await plugin.getThemes();

        if (components == '*') {
          components = cids;
        }
        release.components = components;
        if (!cids.length) {
          return this.logger.warning('No components', 'CLI');
        }

        let questions = [];
        if (args.config && !args.name) {
          questions.push({
            type: 'input',
            name: 'name',
            message: `Release name`,
            default: release.name ? release.name : moment().unix(),
            validate: v => v.toString().replace(/\s+/, '') !== ''
          });
        }
        if ((!hasBuildName || (hasBuildName && args.config)) && !args.version) {
          questions.push({
            type: 'input',
            name: 'version',
            message: `Release version`,
            default: release.version ? release.version : "0.0.1",
            validate: v => v.toString().replace(/\s+/, '') !== ''
          });
        }
        if (!components || !components.length || args.config) {
          questions.push({
            type: 'checkbox',
            name: 'components',
            message: `Components`,
            validate: v => v.length ? true : false,
            choices: _.map(cids, cid => {
              return {
                value: cid,
                checked: components.indexOf(cid) != -1
              }
            })
          });
        }
        if (!args.theme && themes.length > 1) {
          questions.push({
            type: 'list',
            name: 'default_theme',
            message: `Default theme`,
            validate: v => v.replace(/\s+/, '') !== '',
            default: 'default',
            choices: _.map(themes, theme => {
              return {
                value: theme
              }
            })
          });
        } else if (themes.length == 1) {
          release.default_theme = themes[0];
        }
        let answers;
        if (questions.length) {
          answers = await prompts.call(this, questions);
          if (!answers || answers.components && !answers.components.length) {
            return this.logger.warning('No components selected', 'CLI');
          }
          release = _.extend(release, answers);
        }
        themes = _.reject(themes, t => t == release.default_theme);
        if (themes.length) {
          let answers2 = await prompts.call(this, [
            {
              type: 'checkbox',
              name: 'themes',
              message: `Include additional themes`,
              choices: _.map(themes, theme => {
                return {
                  value: theme,
                  checked: false
                }
              })
            }
          ]);
          if (!answers2) {
            return this.logger.log('Action canceled', 'CLI');
          }
          release.themes = answers2.themes;
        }
        if (args.config) {
          let configQuestions = [];
          let results = {};
          configQuestions.push({
            type: 'confirm',
            name: 'inverse',
            message: `Generate inverse version?`,
            default: config.inverse
          });
          results = await prompts.call(this, configQuestions);
          configQuestions = [];
          if (results.inverse) {
            configQuestions.push({
              type: 'confirm',
              name: 'default_inverse',
              message: `Inverse theme by default?`,
              default: config.default_inverse
            });

            configQuestions.push({
              type: 'list',
              name: 'inverse_mode',
              message: `Inverse mode`,
              choices: ['external', 'combined'],
              default: config.inverse_mode
            });
          }
          if (themes.length) {
            configQuestions.push({
              type: 'list',
              name: 'theme_mode',
              message: `Theme mode`,
              choices: ['external', 'combined'],
              default: config.theme_mode
            });
          }
          configQuestions.push({
            type: 'confirm',
            name: 'autoprefixer',
            message: `Autoprefixer?`,
            default: config.autoprefixer
          });
          configQuestions.push({
            type: 'list',
            name: 'direction',
            choices: [{
              value: false,
              name: 'Skip rtl plugin'
            }, {
              value: 'ltr',
              name: 'LTR by default'
            },
            {
              value: 'rtl',
              name: 'RTL by default'
            }],
            default: 'ltr'
          });

          let results2 = await prompts.call(this, configQuestions);

          results = _.extend(results, results2);

          if (results2.direction) {
            configQuestions = [];
            configQuestions.push({
              type: 'confirm',
              name: 'opposite_direction',
              message: `Opposite direction?`,
              default: config.opposite_direction
            });
            results2 = await prompts.call(this, configQuestions);
            results = _.extend(results, results2);
          }
          config = _.extend(config, results);
        }
        await plugin.release(release, config);
      });
    })
    .command('components', 'Show list of existing components', {}, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        let components = await plugin.getComponents();
        if (components.length) {
          this.logger.log(_.map(components, c => '● ' + c).join('\n'), 'CLI');
        } else {
          this.logger.warning('No components', 'CLI');
        }
      });
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.unwatch();
        this.logger.success('Watcher skipped', 'CLI');
      });
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.watch();
        this.logger.success('Watcher enabled', 'CLI');
      });
    })
    .command('remove <cid>', 'Remove component', args => {
      args.positional('cid', {
        describe: 'a unique identifier for component id',
        type: 'string'
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        let answers = await prompts.call(this, [{
          type: 'confirm',
          name: 'remove',
          message: `You want to remove ${args.cid} component?`
        }]);
        if (!answers) {
          this.logger.warning('Action canceled', 'CLI');
          return
        }
        if (answers.remove) {
          try {
            await plugin.removeComponent(args.cid);
            this.logger.success(`${args.cid} component successfully removed!`, 'CLI');
          } catch (e) {
            this.logger.error(e, 'CLI');
          }
          return
        }
      });
    })
    .argv;
}