const path = require('path');
const inquirer = require('inquirer');
const fg = require('fast-glob');
const _ = require('underscore');
const prompts = require('../modules/prompt.js');
module.exports = function(yargs, done) {
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
        let plugin = this.app.project.plugins.get('icons');
        this.rl.rl.pause();
        (async() => {
            try {
                let res = await plugin.exportIcons(args['ids'], args.path);
                this.log(`Icons successfully saved as ${res}`);
                done();
            } catch(e) {
                done(e);
            }
        })();
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
        let plugin = this.app.project.plugins.get('icons');
        this.rl.rl.pause();
        (async()=>{
            try {
                let res = await plugin.importIcons(args.path, args.save);
                this.log(`Icons successfully imported to project`);
                done();
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('release', 'Release icons', args => {
        /*args.option('path', {
            alias: 'p',
            describe: 'Maybe path to the specific icon, multiple paths separated by commas, or glob',
            type: 'string'
        });*/
    }, args => {
        let plugin = this.app.project.plugins.get('icons');
        let questions1 = [{
            type: 'list',
            name: 'type',
            message: `Release type`,
            validate: v => v.replace(/\s+/, '') !== '',
            choices: ['Fonts', 'Image sprite', 'SVG sprite']
        },
        {
            type: 'list',
            name: 'selection_method',
            message: `Icon selection method`,
            validate: v => v.replace(/\s+/, '') !== '',
            choices: ['Glob', 'Choose icons']
        }];

        (async()=>{
            try {
                this.rl.toClose();
                let answers1 = await prompts.call(this, questions1, true);
                let onlySvg = answers1.type != 'Image sprite';
                let iconsType = answers1.type; // +
                let icons = [];
                if(answers1.selection_method == 'Choose icons') {
                    try {
                        let allIcons = plugin.getIconsList(onlySvg);
                        let iconsList = _.pluck(allIcons, 'id');
                        if(!iconsList.length) {
                            this.rl.begin();
                            done('No icons found');
                            return
                        }
                        let requestIcons = await prompts.call(this, [{
                            type: 'checkbox',
                            name: 'icons',
                            message: `Choose icons`,
                            //validate: v => v.replace(/\s+/, '') !== '',
                            choices: iconsList
                        }], true);
                        if(!requestIcons.icons.length) {
                            this.rl.begin();
                            done('No icons selected');
                            return
                        }
                        icons = plugin.collection.filter(model => requestIcons.icons.indexOf(model.get('id')) != -1);
                    } catch(e) {
                        this.rl.begin();
                        done(e);
                        return
                    }
                } else {
                    let globPath = await prompts.call(this, [{
                        type: 'input',
                        name: 'glob',
                        message: `Please input glob path relative to the source icons folder`,
                        default: onlySvg ? '**/*.svg' : '**/*.png',
                        validate: v => v.replace(/\s+/, '') !== ''
                    }], true);

                    try {
                       let entries = await fg(globPath.glob, {
                            cwd: plugin.root
                       });
                       if(!entries.length) {
                            this.rl.begin();
                            done('No icons fount');
                            return
                       }
                       let pathes = _.map(entries, p => path.normalize(p));
                       icons = plugin.collection.filter(m => {
                            if(pathes.indexOf(path.normalize(m.get('path'))) != -1) {
                                if(onlySvg && m.has('svg') || !onlySvg && !m.has('svg')) {
                                    return m;
                                }
                            }
                       });
                       if(!icons.length) {
                            this.rl.begin();
                            done('No matching icons');
                            return
                       }
                   } catch(e) {
                       this.rl.begin();
                       done(e);
                       return
                   }
                }

                // icons
                let questions = [{
                    type: 'input',
                    name: 'name',
                    default: 'main',
                    message: `Release name`,
                    validate: v => v.replace(/\s+/, '') !== ''
                },
                {
                    type: 'input',
                    name: 'version',
                    default: '0.0.1',
                    message: `Release version`,
                    validate: v => v.replace(/\s+/, '') !== ''
                }];

                let answers = await prompts.call(this, questions, true);
                if(!answers) {
                    this.rl.begin();
                    done('action canceled');
                    return
                }
                answers.type = iconsType;
                this.rl.begin();
                this.rl.rl.pause();
                await plugin.release(answers, icons);
                done();
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
        let plugin = this.app.project.plugins.get('icons');
        plugin.unwatch();
        done('Watcher skipped');
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
        let plugin = this.app.project.plugins.get('icons');
        plugin.watch();
        done('Watcher enabled');
    })
    .argv;
}