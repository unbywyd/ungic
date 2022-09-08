const _ = require('underscore');
const path = require('path');
const moment = require('moment');
const prompts = require('../modules/prompt.js');
let colors = require('colors');
const fse = require('fs-extra');


module.exports = function (yargs, done) {
  yargs
    .command('valid <path>', 'Check page from the dist directory using validator.w3.org', args => {
      args.positional('path', {
        describe: 'path to file in dist directory or file name',
        type: 'string',
        default: ''
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        try {
          let res = await plugin.distValidate(args.path);
          this.logger.system(res, 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('pretty <path>', 'Convert to beautiful html from the dist directory', args => {
      args.positional('path', {
        describe: 'path to file in dist directory or file name',
        type: 'string',
        default: ''
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        try {
          await plugin.distPretty(args.path);
          this.logger.system('Done!', 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('compress <path>', 'Compress html file of the dist directory', args => {
      args.positional('path', {
        describe: 'path to file in dist directory or file name',
        type: 'string',
        default: ''
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        try {
          await plugin.distCompress(args.path);
          this.logger.system('Done!', 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('amp_valid <path>', 'Check page from the dist directory using amp-validator', args => {
      args.positional('path', {
        describe: 'path to file in dist directory or file name',
        type: 'string',
        default: ''
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        try {
          let res = await plugin.distAmpValidate(args.path);
          this.logger.system(res, 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('create <name>', 'Create new page', args => {
      args.positional('name', {
        describe: 'page name',
        type: 'string',
        default: ''
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        let scssPlugin = this.app.project.plugins.get('scss');
        let components = await scssPlugin.getComponents();
        let questions = [{
          type: 'input',
          name: 'lang',
          message: `Language ISO Code. Will set lang attribute to the html tag`,
          default: 'en',
          validate: v => v.replace(/\s+/, '') !== ''
        }];
        let response = await prompts.call(this, questions);
        let lang = 'en';
        if(response) {
          lang = response.lang;
        }
        questions = [{
          type: 'boolean',
          name: 'rtl',
          message: `RTL`,
          default: ['he', 'ar'].includes(lang)
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
        if (components.length) {
          questions.push({
            type: 'checkbox',
            name: 'components',
            message: `Include sass components`,
            choices: components
          });
        }
        let answers = await prompts.call(this, questions);
        if (!answers) {
          return this.logger.warning('Action canceled', 'CLI');
        }
        answers.lang = lang;
        answers.name = args.name;
        try {
          await plugin.createPage(answers);
          this.logger.system('Done!', 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('pages', 'Show list of pages', {}, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        let pages = plugin.collection.findAllWhere({ type: 'page' });
        if (!pages.length) {
          return this.logger.warning('This project has no pages', 'CLI');
        }
        this.logger.system(_.map(pages, p => '● ' + p.path).join('\n'), 'CLI');
      });
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        plugin.unwatch();
        this.logger.system('Watcher disabled', 'CLI');
      });
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        plugin.watch();
        this.logger.system('Watcher enabled', 'CLI');
      })
    })
    .command('remove <name>', 'Remove page', args => {
      args.positional('name', {
        describe: 'page name',
        type: 'string'
      });
    }, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('html');
        try {
          await plugin.removePage(args.name);
          this.logger.system(`${args.name} page successfully removed!`, 'CLI');
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      })
    })
    .argv;
}