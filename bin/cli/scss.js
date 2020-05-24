const inquirer = require('inquirer');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');
const moment = require('moment');
let colors = require('colors');

function log(message, type) {
    if(type == 'error') {
        type = colors.red.bold(type);
    }
    if(type == 'warning') {
        type = colors.yellow.bold(type);
    }
    console.log(`${type}::${message}`);
}

module.exports = function(yargs, done) {
   yargs
    .command('create <cid>', 'Create new component', args => {
        args.positional('cid', {
            describe: 'a unique identifier for component id',
            type: 'string'
        });
    }, args => {
        let plugin = this.app.project.plugins.get('scss');
        (async()=> {
            try {
                this.rl.rl.pause();
                let created = await plugin.createComponent(args.cid);
                return done(`${args.cid} component successfully created!`);
            } catch(e) {
                done(e);
            }
        })();
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
            let plugin = this.app.project.plugins.get('scss');
            let components = [];
            let build = plugin.builder.config;
            let releaseConfigs = build.release.configs;
            let releaseBuilds = build.release.build;

            if(!releaseBuilds[args.release_name]) {
               log(`Default configuration will be used because ${args.release_name} release build scheme configuration not specified in build_schemes.`, 'warning');
            }

            let config = Object.assign({}, releaseConfigs.default);
            let hasBuildName = !!(releaseBuilds[args.release_name]);

            if(hasBuildName) {
                let config_id = releaseBuilds[args.release_name].config_id;
                if(!releaseConfigs[config_id]) {
                    log(`${config_id} config_id is not specified in release configs. Default configuration will be used.`, 'warning');
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

            if(!release.name) {
                release.name = moment().unix();
            }

            if("version" in args) {
                release.version = args.version;
            }
            if("theme" in args) {
                release.default_theme = args.theme;
            }

            if("inv" in args) {
                config.inverse = args.inv;
            }
            if("definv" in args) {
                config.default_inverse = args.definv;
            }
            if("tmode" in args) {
                if(["combined", "external"].indexOf(args.tmode) == -1) {
                    return done('Theme mode must be "combined" or "external"', 'error');
                }
                config.theme_mode = args.tmode;
            }
            if("invmode" in args) {
                if(["combined", "external"].indexOf(args.invmode) == -1) {
                    return done('Inverse mode must be "combined" or "external"', 'error');
                }
                config.inverse_mode = args.invmode;
            }
            if("autoprefixer" in args) {
                config.autoprefixer = args.autoprefixer;
            }
            if("dir" in args) {
                config.direction = args.dir;
            }
            if("odir" in args) {
                config.opposite_direction = args.odir;
            }

            (async()=> {
                try {
                   this.rl.toClose();

                   let reConfigRequest = await prompts.call(this, [{
                        type: 'confirm',
                        message: hasBuildName ? 'You want to reconfigure release scheme configuration?' : 'You want to reconfigure default configuration?',
                        name: 'config',
                        default: false
                   }], true);

                   args.config = reConfigRequest.config;


                   let cids = await plugin.getComponents();
                   let themes = await plugin.getThemes();

                   if(components == '*') {
                        components = cids;
                   }
                   release.components = components;
                   if(!cids.length) {
                        return done('No components', 'warning');
                   }

                   let questions = [];
                   if(args.config && !args.name) {
                        questions.push({
                            type: 'input',
                            name: 'name',
                            message: `Release name`,
                            default: release.name ? release.name : moment().unix(),
                            validate: v => v.toString().replace(/\s+/, '') !== ''
                        });
                   }
                   if((!hasBuildName || (hasBuildName && args.config)) && !args.version) {
                        questions.push({
                            type: 'input',
                            name: 'version',
                            message: `Release version`,
                            default: release.version ? release.version : "0.0.1",
                            validate: v => v.toString().replace(/\s+/, '') !== ''
                        });
                   }
                   if(!components || !components.length || args.config) {
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
                   if(!args.theme && themes.length > 1) {
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
                    } else if(themes.length == 1) {
                        release.default_theme = themes[0];
                    }
                    let answers;
                    if(questions.length) {
                        answers = await prompts.call(this, questions, true);
                        if(!answers || answers.components && !answers.components.length) {
                            this.rl.begin();
                            return done('No components selected', 'warning');
                        }
                        release = _.extend(release, answers);
                    }
                    themes = _.reject(themes, t => t == release.default_theme);
                    if(themes.length) {
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
                        ], true);
                        if(!answers2) {
                            this.rl.begin();
                            done('Action canceled', 'warning');
                            return
                        }
                        release.themes = answers2.themes;
                    }

                    if(args.config) {
                        let configQuestions = [];
                        let results = {};
                        configQuestions.push({
                            type: 'confirm',
                            name: 'inverse',
                            message: `Generate inverse version?`,
                            default: config.inverse
                        });
                        results = await prompts.call(this, configQuestions, true);
                        configQuestions = [];

                        if(results.inverse) {
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

                        if(themes.length) {
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

                        let results2 = await prompts.call(this, configQuestions, true);

                        results = _.extend(results, results2);

                        if(results2.direction) {
                            configQuestions = [];
                            configQuestions.push({
                                type: 'confirm',
                                name: 'opposite_direction',
                                message: `Opposite direction?`,
                                default: config.opposite_direction
                            });
                            results2 = await prompts.call(this, configQuestions, true);
                            results = _.extend(results, results2);
                        }
                        config = _.extend(config, results);
                    }
                    await plugin.release(release, config);
                    this.rl.begin();
                    done();
                } catch(e) {
                  console.log(e);
                }
            })();


    })
    .command('components', 'Show list of existing components', {}, args => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.getComponents().then(components => {
            if(components.length) {
                console.log(_.map(components, c=> '● ' + c).join('\n'));
            } else {
                console.log('No components');
            }
            done();
        });
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.unwatch();
        done('Watcher skipped');
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.watch();
        done('Watcher enabled');
    })
    .command('remove <cid>', 'Remove component', args => {
        args.positional('cid', {
            describe: 'a unique identifier for component id',
            type: 'string'
        });
    }, args => {
        let plugin = this.app.project.plugins.get('scss');
        (async()=> {
            let answers = await prompts.call(this, [{
                type: 'confirm',
                name: 'remove',
                message: `You want to remove ${args.cid} component?`
            }]);
            if(!answers) {
                done('action canceled');
                return
            }
            if(answers.remove) {
                try {
                    this.rl.rl.pause();
                    let created = await plugin.removeComponent(args.cid);
                    done(`${args.cid} component successfully removed!`);
                } catch(e) {
                    done(e);
                }
                return
            }
            done();
        })();
    })
    .argv;
}