const inquirer = require('inquirer');
const _ = require('underscore');
const path = require('path');
const moment = require('moment');
const prompts = require('../modules/prompt.js');
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
    .command('valid <path>', 'Check page from the dist directory using validator.w3.org', args => {
        args.positional('path', {
            describe: 'path to file in dist directory or file name',
            type: 'string',
            default: ''
        });
    }, args => {
        let plugin = this.app.project.plugins.get('html');
        this.rl.rl.pause();
        (async()=>{
            try {
                let res = await plugin.distValidate(args.path);
                console.log(res);
                done();
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('pretty <path>', 'Convert to beautiful html from the dist directory', args => {
        args.positional('path', {
            describe: 'path to file in dist directory or file name',
            type: 'string',
            default: ''
        });
    }, args => {
        let plugin = this.app.project.plugins.get('html');
        (async()=>{
            try {
                await plugin.distPretty(args.path);
                done('Done!');
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('compress <path>', 'Compress html file of the dist directory', args => {
        args.positional('path', {
            describe: 'path to file in dist directory or file name',
            type: 'string',
            default: ''
        });
    }, args => {
        let plugin = this.app.project.plugins.get('html');
        (async()=>{
            try {
                await plugin.distCompress(args.path);
                done('Done!');
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('amp_valid <path>', 'Check page from the dist directory using amp-validator', args => {
        args.positional('path', {
            describe: 'path to file in dist directory or file name',
            type: 'string',
            default: ''
        });
    }, args => {
        let plugin = this.app.project.plugins.get('html');
        this.rl.rl.pause();
        (async()=>{
            try {
                let res = await plugin.distAmpValidate(args.path);
                console.log(res);
                done();
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('create <name>', 'Create new page', args => {
        args.positional('name', {
            describe: 'page name',
            type: 'string',
            default: ''
        });
    }, args => {
        let plugin = this.app.project.plugins.get('html');
        (async()=> {
            let scssPlugin = this.app.project.plugins.get('scss');
            let components = await scssPlugin.getComponents();
            let questions = [{
                type: 'input',
                name: 'lang',
                message: `Language ISO Code. Will set lang attribute to the html tag`,
                default: 'en',
                validate: v => v.replace(/\s+/, '') !== ''
            },
            {
                type: 'boolean',
                name: 'rtl',
                message: `RTL`,
                default: false
            },
            {
                type: 'input',
                name: 'title',
                message: `Title`,
                default: 'My page',
                validate: v => v.replace(/\s+/, '') !== ''
            },
            {
                type: 'input',
                name: 'description',
                message: `Description`,
                default: ''
            }];

            if(components.length) {
                questions.push({
                    type: 'checkbox',
                    name: 'components',
                    message: `Include sass components`,
                    choices: components
                });
            }

            let answers = await prompts.call(this, questions);
            if(!answers) {
                done('action canceled');
                return
            }
            answers.name = args.name;
            this.rl.rl.pause();
            try {
                let created = await plugin.createPage(answers);
                done(`Done!`);
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('release <release_name>', 'Full release of a specific page', yargs => {
            return yargs.option('page', {
                alias: 'p',
                type: 'string',
                description: 'Page name'
            }).option('version', {
                alias: 'v',
                type: 'number',
                description: 'Release version'
            })
        }, args => {
            let plugin = this.app.project.plugins.get('html');
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
                version: '0.0.1'
            }

            release = _.extend(release, config);


            let questions = [], questionsNews = [];


            let pages = plugin.collection.findAllWhere({type: 'page'});
            if(!pages.length) {
                return done(new Error(`This project has no pages.`));
            }

            questionsNews.push({
                type: 'confirm',
                name: 'validation',
                message: `You want to validate html with w3 validator?`,
                default: release.validation != undefined ? release.validation : true
            });

            let out_style = false;
            if(release.beautify) {
                out_style = 'beautify';
            }
            if(release.minifier) {
                out_style = 'minifier';
            }
            questionsNews.push({
                type: 'list',
                name: 'output_style',
                message: `Select an action (style of html)`,
                default: out_style,
                choices: [
                    {
                        value: false,
                        name: 'Skip, do nothing'
                    },
                    {
                        value: 'beautify',
                        name: 'Beautify'
                    },
                    {
                        value: 'minifier',
                        name: 'Minifier'
                    }
                ]
            });
            questionsNews.push({
                type: 'string',
                name: 'host',
                message: `Host (replace the relative path of resources and styles from css and html with the hostname, scripts will not be processed!)`,
                default: release.host ? release.host : '/',
                validate: v => v.replace(/\s+/, '') !== ''
            });

            questionsNews.push({
                type: 'confirm',
                name: 'include_external_styles',
                message: `Include all local external styles to internal styles?`,
                default: release.include_external_styles != undefined ? release.include_external_styles : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'styles_in_footer',
                message: `Do you want to append style tags to the end of the body tag? (with html 5.2 It is allowed)`,
                default: release.styles_in_footer != undefined ? release.styles_in_footer : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'merge_internal_styles',
                message: `Merge all internal stylesheets?`,
                default: release.merge_internal_styles != undefined ? release.merge_internal_styles : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'optimize_internal_styles',
                message: `Optimize internal stylesheets?`,
                default: release.optimize_internal_styles != undefined ? release.optimize_internal_styles : false
            });

            questionsNews.push({
                type: 'confirm',
                name: 'include_local_scripts',
                message: `Include all local scripts to internal scripts?`,
                default: release.include_local_scripts != undefined ? release.include_local_scripts : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'internal_scripts_in_footer',
                message: `Move all internal scripts to footer?`,
                default: release.internal_scripts_in_footer != undefined ? release.internal_scripts_in_footer : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'external_scripts_in_footer',
                message: `Move all external scripts to footer?`,
                default: release.external_scripts_in_footer != undefined ? release.external_scripts_in_footer : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'merge_internal_scripts',
                message: `Merge all internal scripts?`,
                default: release.merge_internal_scripts != undefined ? release.merge_internal_scripts : false
            });
            questionsNews.push({
                type: 'confirm',
                name: 'optimize_internal_scripts',
                message: `Optimize internal scripts?`,
                default: release.optimize_internal_scripts != undefined ? release.optimize_internal_scripts : false
            });

            let page = args.page ? args.page : args.release_name;

            let scssPlugin = this.app.project.plugins.get('scss');
            let iconsPlugin = this.app.project.plugins.get('icons');

            let pageFind = _.find(pages, p => path.basename(p.path, path.extname(p.path)) == page);
            let params = args;
            params = _.extend(release, params);
            if(pageFind) {
                params.page = pageFind;
            } else {
                if(args.page) {
                    log(`${args.page} page not exist, will be asked to choose from a list`, 'warning');
                }
                questions.push({
                    type: 'list',
                    name: 'page_path',
                    message: `Select page to release`,
                    choices: _.map(pages, p => p.path)
                });
            }
            (async()=>{
                this.rl.toClose();
                let toConfig = true;

                toConfig = await prompts.call(this, [{
                    type: 'confirm',
                    name: 'reconfig',
                    message: hasBuildName ? 'You want to reconfigure release scheme configuration?' : 'You want to reconfigure default configuration?',
                    default: !hasBuildName
                }], true);
                toConfig = toConfig.reconfig;


                if((!hasBuildName || (hasBuildName && toConfig)) && !args.version) {
                    questionsNews.unshift({
                        type: 'input',
                        name: 'version',
                        default: release.version ? release.version : '0.0.1',
                        message: `Release version`,
                        validate: v => v.replace(/\s+/, '') !== ''
                    });
                }

                if(toConfig) {
                    questions = questions.concat(questionsNews);
                }

                if(questions.length) {
                    try {
                        let answers = await prompts.call(this, questions, true);
                        if(!answers) {
                            this.rl.begin();
                            done('Action canceled', 'warning');
                            return
                        } else {
                            if(params.output_style) {
                                params[params.output_style] = true;
                            }
                            if(!params.page) {
                                page = path.basename(answers.page_path, path.extname(answers.page_path));
                                params.page =  _.find(pages, p => p.path == answers.page_path);
                            }
                            let data = await plugin.getReleaseInfo(params.page);
                            let questions2 = [];

                            let allIcons = data.icons && data.icons.length ? data.icons : [];
                            if(allIcons.length) {
                                params.icons_ids = _.pluck(allIcons, 'icon_id');
                            }
                            if(data.pipes && data.pipes.length) {
                                // Get icons from sass
                                params.pipes = data.pipes;
                                let iconsSassUsed = scssPlugin.iconsSaveStorage.storage;
                                let icons = [];
                                for(let cid of data.pipes) {
                                    let res = _.filter(iconsSassUsed, icon => {
                                        return icon.cid == cid
                                    });
                                    if(res) {
                                        icons = icons.concat(res);
                                    }
                                }
                                if(icons.length) {
                                    let icons_ids = [];
                                    if(icons.length) {
                                        icons_ids = icons_ids.concat(_.pluck(icons, 'icon_id'), params.icons_ids);
                                        icons_ids = _.uniq(icons_ids);
                                    }
                                    params.icons_ids = icons_ids;
                                }
                                questions2.push({
                                    type: 'confirm',
                                    name: 'scss_release',
                                    message: `The project uses ${data.pipes.length} css components, do you want to build a scss release?`,
                                    default: release.scss_release != undefined ? release.scss_release : true
                                });
                            }


                            if(params.icons_ids && params.icons_ids.length) {
                                questions2.unshift({
                                    type: 'confirm',
                                    name: 'icons_release',
                                    message: `The project uses ${params.icons_ids.length} icons, do you want to combine them into a release?`,
                                    default: release.icons_release != undefined ? release.icons_release : true
                                });
                            }

                            let answ = await prompts.call(this, questions2, true);
                            if(!answ) {
                                this.rl.begin();
                                done('Action canceled', 'warning');
                            } else {
                                if(answ.scss_release) {
                                    let componentsRequest = await prompts.call(this, [{
                                        type: 'checkbox',
                                        name: 'components',
                                        message: 'Select css components',
                                        choices: data.pipes,
                                        validate: v => v.length ? true : false,
                                    }], true);
                                    if(componentsRequest) {
                                        params.scss_components = componentsRequest.components;
                                    } else {
                                        params.scss_release = false;
                                        log("Action canceled, scss release will skipped", 'warning');
                                    }
                                }
                                params = _.extend(params, answ);
                            }
                        }
                        params = _.extend(params, answers);
                    } catch(e) {
                        console.log(e);
                    }
                }

                try {
                    if(params.icons_release) {
                        let icons = iconsPlugin.collection.filter(m=> params.icons_ids.indexOf(m.id) != -1);

                        let sprites = _.filter(icons, i => !i.has('svg'));
                        let svg = _.filter(icons, i=>i.has('svg'));

                        let iconsReleases = [];
                        if(svg.length) {
                            let answ = await prompts.call(this, [{
                                type: 'list',
                                name: 'type',
                                validate: v => v.replace(/\s+/, '') !== '',
                                choices: [
                                    {
                                        value: 'fonts',
                                        name: 'Fonts'
                                    },
                                    {
                                        value: 'svg_sprites',
                                        name: 'Svg sprites'
                                    }
                                ]
                            }], true);
                            if(!answ) {
                                log("Action canceled, icons release will skipped", 'warning');
                                params.icons_release = false;
                            } else {
                                try {
                                    let res = await iconsPlugin.release({
                                        type: answ.type,
                                        version: params.version,
                                        name: params.release_name
                                    }, svg);
                                    if(res) {
                                        iconsReleases.push({
                                            type: answ.type,
                                            icons: svg,
                                            release: res
                                        });
                                    }
                                } catch(e) {
                                    console.log(e);
                                    log('Release of icons failed', 'error');
                                }
                            }

                        }
                        if(params.icons_release) {
                            try {
                                let res = await iconsPlugin.release({
                                    type: 'sprites',
                                    version: params.version,
                                    name: params.release_name
                                }, sprites);
                                if(res) {
                                    iconsReleases.push({
                                        type: 'sprites',
                                        icons: sprites,
                                        release: res
                                    });
                                }
                            } catch(e) {
                                console.log(e);
                                log('Release of icons failed', 'error');
                            }
                            params.iconsReleases = iconsReleases;
                        }
                    }
                } catch(e) {
                    console.log(e);
                }



                if(params.scss_release) {
                    try {
                        let components = params.scss_components;
                        let build = scssPlugin.builder.config;
                        let releaseConfig = build.release.configs;
                        let releaseBuilds = build.release.build;

                        let qs = await prompts.call(this, [{
                            type: 'input',
                            name: 'release_name',
                            message: 'release_name of sass build configuration',
                            validate: v => v.toString().replace(/\s+/, '') !== '',
                            default: params.release_name
                        }], true);

                        let scssReleaseName = (qs && qs.release_name) ? qs.release_name : moment().unix();

                        let config = Object.assign({}, releaseConfig.default);
                        let hasBuildName = !!(releaseBuilds[scssReleaseName]);

                        if(hasBuildName) {
                            let config_id = releaseBuilds[scssReleaseName].config_id;
                            if(!releaseConfig[config_id]) {
                                log(`${config_id} config_id is not specified in release configs. Default configuration will be used.`, 'warning');
                            } else {
                                config = _.extend(config, releaseConfig[config_id]);
                            }
                        } else {
                            log(`Default configuration will be used for scss release because ${scssReleaseName} release id not specified in build_schemes file.`, 'warning');
                        }

                        let release = hasBuildName ? releaseBuilds[scssReleaseName] : {
                            config_id: "default",
                            default_theme: 'default',
                            version: params.version
                        }

                        release.name = params.release_name;
                        release.components = components;
                        release.version = params.version;

                       let themes = await scssPlugin.getThemes();


                       let answers = {};
                       let questions = [];
                       if(themes.length > 1) {
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
                        if(questions.length) {
                            answers = await prompts.call(this, questions, true);
                        }

                        if(answers) {
                            release = _.extend(release, answers);
                            themes = _.reject(themes, t => t == release.default_theme);
                            let themesRequest = {};
                            if(themes.length) {
                                themesRequest = await prompts.call(this, [
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
                                release.themes = themesRequest.themes;
                            }
                            if(params.include_styles) {
                                config.inverse_mode = 'combined';
                                config.theme_mode = 'combined';
                            }

                            let req = await prompts.call(this, [{
                                type: 'confirm',
                                name: 'correct',
                                message: 'Correct the configuration?',
                                default: !hasBuildName
                            }], true);

                            if(req.correct) {
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

                                    if(!params.include_styles) {
                                        configQuestions.push({
                                            type: 'list',
                                            name: 'inverse_mode',
                                            message: `Inverse mode`,
                                            choices: ['external', 'combined'],
                                            default: config.inverse_mode
                                        });
                                    } else {
                                        config.inverse_mode = 'combined';
                                    }
                                }

                                if(themes.length && !params.include_styles) {
                                    configQuestions.push({
                                        type: 'list',
                                        name: 'theme_mode',
                                        message: `Theme mode`,
                                        choices: ['external', 'combined'],
                                        default: config.theme_mode
                                    });
                                } else if(params.include_styles) {
                                    config.theme_mode = 'combined';
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
                            let result = await scssPlugin.release(release, config);
                            params.scssURLS = result;
                        } else {
                            log('Action canceled, scss release will skipped', 'warning');
                        }
                    } catch(e) {
                      console.log(e);
                    }
                }

                try {
                    params.name = args.release_name;
                    await plugin.toRelease(params);
                    this.rl.begin();
                    return done('Release generated to ' + path.join(plugin.dist, 'releases', params.name + '.' + params.version), 'success');
                } catch(e) {
                    this.rl.begin();
                    return done(e);
                }
            })();

    })
    .command('pages', 'Show list of pages', {}, args => {
        let plugin = this.app.project.plugins.get('html');
        let pages = plugin.collection.findAllWhere({type: 'page'});
        if(!pages.length) {
            return done('This project has no pages');
        }
        //this.rl.log();
        done(_.map(pages, p => '● ' + p.path).join('\n'));
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
        let plugin = this.app.project.plugins.get('html');
        plugin.unwatch();
        done('Watcher skipped');
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
        let plugin = this.app.project.plugins.get('html');
        plugin.watch();
        done('Watcher enabled');
    })
    .command('remove <name>', 'Remove page', args => {
        args.positional('name', {
            describe: 'page name',
            type: 'string'
        });
    }, args => {
        this.rl.rl.pause();
        (async()=>{
            let plugin = this.app.project.plugins.get('html');
            try {
                await plugin.removePage(args.name);
                done(`${args.name} page successfully removed!`);
            } catch(e) {
                done(e);
            }
        })();
    })
    .argv;
}