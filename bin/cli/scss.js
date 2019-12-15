const inquirer = require('inquirer');
const _ = require('underscore');

let prompts = async function(questions) {
    this.rl.rl.close();
    let answers = await inquirer.prompt(questions);
    this.rl.begin();
    return answers;
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
    .command('release', 'Assemble components in a release', yargs => {
            return yargs.option('skip', {
                alias: 's',
                type: 'boolean',
                description: 'Skip preset',
                default: false
            })
            .option('name', {
                alias: 'n',
                type: 'string',
                description: 'Release name',
                default: 'main'
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
            if(build.release.build[name]) {
                if(build.release.build[name].components) {
                    components = build.release.build[name].components
                }
                if(build.release.build[name].config) {
                    configName = build.release.build[name].config;
                }
                if(build.release.build[name].version) {
                    version = build.release.build[name].version;
                }
                if(build.release.build[name].default_theme) {
                    defaultTheme =  build.release.build[name].default_theme;
                }
            }
            if(args.config) {
                configName = args.config;
            }
            if(args.version) {
                version = args.version;
            }
            if(args.theme) {
                defaultTheme = args.theme;
            }
            (async()=> {
               if(args.skip && !args.name) {
                    return this.error(`Release name required`, {exit: true});
               }
               if(args.skip) {
                    if(!build.release.build[name]) {
                        return this.error(`Not exists ${name} build configuration`, {exit: true});
                    }
                    let config = _.extend({
                        version: '0.0.1',
                        default_theme: 'default',
                        config: 'default',
                        themes: [],
                        components: []
                    }, build.release.build[name]);

                    if(args.version) {
                        config.version = args.version;
                    }
                    if(args.theme) {
                        config.default_theme = args.theme;
                    }
                    if(args.config) {
                        config.config = args.config;
                    }
                    this.rl.rl.pause();
                    await plugin.release(name, config);
                    return done();
               }
               let cids = await plugin.getComponents();
               let themes = await plugin.getThemes();

               if(components == '*') {
                    components = cids;
               }
               if(!cids.length) {
                    this.log('No components');
                    return done();
               }
               let questions = [{
                    type: 'input',
                    name: 'name',
                    message: `Release name`,
                    default: name,
                    validate: v => v.replace(/\s+/, '') !== ''
                },
                {
                    type: 'input',
                    name: 'version',
                    message: `Release version`,
                    default: version,
                    validate: v => v.replace(/\s+/, '') !== ''
                },
                {
                    type: 'input',
                    name: 'config',
                    message: `Release configuration id`,
                    default: configName,
                    validate: v => v.replace(/\s+/, '') !== ''
                },
                {
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
                },
                {
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
                }];

                let answers = await prompts.call(this, questions);

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

               answers = _.extend(answers, answers2);
               this.rl.rl.pause();
               await plugin.release(args.name, answers);
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