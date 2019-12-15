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
            answers.name = args.name;
            this.rl.rl.pause();
            try {
                let created = await plugin.createPage(answers);
                done(`${args.name} page successfully created!`);
            } catch(e) {
                done(e);
            }
        })();
    })
    .command('release', 'Assemble components in a release', yargs => {
            return yargs.option('name', {
                alias: 'n',
                type: 'string',
                description: 'Release name',
            })
            .option('version', {
                alias: 'v',
                type: 'number',
                description: 'Release version'
            })
        }, args => {
            let questions = [];
            if(!args.name) {
                questions.push({
                    type: 'input',
                    name: 'name',
                    default: 'main',
                    message: `Release name`,
                    validate: v => v.replace(/\s+/, '') !== ''
                });
            }
            if(!args.version) {
                questions.push({
                    type: 'input',
                    name: 'version',
                    default: '0.0.1',
                    message: `Release version`,
                    validate: v => v.replace(/\s+/, '') !== ''
                });
            }
            let plugin = this.app.project.plugins.get('html');
            let pages = plugin.collection.findAllWhere({type: 'page'});
            if(!pages.length) {
                return done(new Error(`No pages in the project for the compilation of release`));
            }
            questions.push({
                type: 'string',
                name: 'host',
                message: `Host`,
                default: '/',
                validate: v => v.replace(/\s+/, '') !== ''
            });
            questions.push({
                type: 'checkbox',
                name: 'pages',
                message: `Pages for release`,
                choices: _.map(pages, p => p.path)
            });
            (async()=>{
                let params = args;
                if(questions.length) {
                    let answers = await prompts.call(this, questions);
                    params = _.extend(params, answers);
                }
                this.rl.rl.pause();
                await plugin.toRelease(params);
                try {
                    done();
                } catch(e) {
                    done(e);
                }
            })();

    })
    .command('pages', 'Show list of pages', {}, args => {
        let plugin = this.app.project.plugins.get('html');
        let pages = plugin.collection.findAllWhere({type: 'page'});
        if(!pages.length) {
            return done('This project has no pages');
        }
        console.log(_.map(pages, p => '● ' + p.path).join('\n'));
        done();
    })
    .command('unwatch', 'Disable file watcher', {}, () => {
        let plugin = this.app.project.plugins.get('html');
        plugin.unwatch();
        done('Watcher disabled');
    })
    .command('watch', 'Enable file watcher', {}, () => {
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