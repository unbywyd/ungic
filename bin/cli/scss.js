const inquirer = require('inquirer');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');

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
    .command('release [name]', 'Assemble components in a release', yargs => {
            return yargs.option('skip', {
                alias: 's',
                type: 'boolean',
                description: 'Skip preset',
                default: false
            })
            .option('name', {
                alias: 'n',
                type: 'string',
                description: 'Release name'
            })
            .option('config', {
                alias: 'c',
                type: 'string',
                description: 'ID of release configuration scheme'
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
            let build = plugin.builder.config;

            let components = [];
            let configName, version, defaultTheme;
            let name = args.name;
            let buildConfig = {}

            if(name && build.release.build[name]) {
                buildConfig.name = name;
                if(build.release.build[name].components) {
                    components = build.release.build[name].components
                }
                if(build.release.build[name].config) {
                    configName = build.release.build[name].config;
                    buildConfig.config = configName;
                }
                if(build.release.build[name].version) {
                    version = build.release.build[name].version;
                    buildConfig.version = version;
                }
                if(build.release.build[name].default_theme) {
                    defaultTheme =  build.release.build[name].default_theme;
                    buildConfig.default_theme = defaultTheme;
                }
            }

            if(args.config) {
                configName = args.config;
                buildConfig.config = configName;
            }
            if(args.version) {
                version = args.version;
                buildConfig.version = version;
            }
            if(args.theme) {
                defaultTheme = args.theme;
                buildConfig.default_theme = defaultTheme;
            }

            (async()=> {
               let cids = await plugin.getComponents();
               let themes = await plugin.getThemes();

               if(components == '*') {
                    components = cids;
               }
               buildConfig.components = components;
               if(!cids.length) {
                    this.log('No components');
                    return done();
               }
               let questions = [];
               if(!name) {
                    questions.push({
                        type: 'input',
                        name: 'name',
                        message: `Release name`,
                        validate: v => v.replace(/\s+/, '') !== ''
                    });
               }
               if(!version) {
                    questions.push({
                        type: 'input',
                        name: 'version',
                        message: `Release version`,
                        default: "0.0.1",
                        validate: v => v.replace(/\s+/, '') !== ''
                    });
               }
               if(!configName) {
                    questions.push({
                        type: 'input',
                        name: 'config',
                        message: `Release configuration id`,
                        default: "default",
                        validate: v => v.replace(/\s+/, '') !== ''
                    });
               }
               if(!components || !components.length) {
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
               if(!defaultTheme) {
                    questions.push({
                        type: 'list',
                        name: 'default_theme',
                        message: `Default theme`,
                        validate: v => v.replace(/\s+/, '') !== '',
                        choices: _.map(themes, theme => {
                            return {
                                value: theme,
                                checked: theme == defaultTheme
                            }
                        })
                    });
                }
                let answers;
                if(questions.length) {
                    answers = await prompts.call(this, questions);
                    if(!answers) {
                        done('action canceled');
                        return
                    }
                    answers = _.extend(buildConfig, answers);
                } else {
                    answers = buildConfig;
                }

                themes = _.reject(themes, t => t == answers.default_theme);

                let answers2 = await prompts.call(this, [
                    {
                        type: 'checkbox',
                        name: 'themes',
                        message: `Include themes`,
                        choices: _.map(themes, theme => {
                            return {
                                value: theme,
                                checked: false
                            }
                        })
                    }
                ]);
                if(!answers2) {
                    done('action canceled');
                    return
                }

               answers = _.extend(answers, answers2);
               this.rl.rl.pause();
               await plugin.release(answers.name, answers);
               done();
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
    .command('unwatch', 'Disable file watcher', {}, () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.unwatch();
        done('Watcher disabled');
    })
    .command('watch', 'Enable file watcher', {}, () => {
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