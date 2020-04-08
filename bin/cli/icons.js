const inquirer = require('inquirer');
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
        })
    }, args => {
        let plugin = this.app.project.plugins.get('icons');
        this.rl.rl.pause();
        (async()=>{
            try {
                let res = await plugin.importIcons(args.path);
                this.log(`Icons successfully imported to project`);
                done();
            } catch(e) {
                done(e);
            }
        })();
    })
    .argv;
}