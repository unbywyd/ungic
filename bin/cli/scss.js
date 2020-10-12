const _ = require('underscore');
const prompts = require('../modules/prompt.js');
const scssInquirer = require('./release/scss_inquirer');
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
          this.logger.system(`${args.cid} component successfully created!`, 'CLI', true);
        } catch (e) {
          this.logger.system(e, 'CLI');
        }
      });
    })
    .command('release <release_name> [build_name]', 'Assemble components in a release', yargs => {
        yargs.option('version', {
          alias: 'v',
          type: 'number',
          description: 'Release version'
        })
    }, args => {
      done(async () => {
        try {
          let plugin = this.app.project.plugins.get('scss');
          args.scss_build_name = args.build_name ? args.build_name : args.release_name;
          args.requestVersion = true;
          let release = await scssInquirer.call(this, args);
          if(typeof release == 'object') {
            await plugin.release(release);
          }
        } catch(e) {
          console.log(e);
        }
      });
    })
    .command('components', 'Show list of existing components', {}, args => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        let components = await plugin.getComponents();
        if (components.length) {
          this.logger.system(_.map(components, c => '● ' + c).join('\n'), 'CLI');
        } else {
          this.logger.warning('No components', 'CLI');
        }
      });
    })
    .command('unwatch', 'Skip file changes for this plugin', {}, () => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.unwatch();
        this.logger.system('Watcher disabled', 'CLI');
      });
    })
    .command('watch', 'Continue to watch file changes for this plugin', {}, () => {
      done(async () => {
        let plugin = this.app.project.plugins.get('scss');
        plugin.watch();
        this.logger.system('Watcher enabled', 'CLI');
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
          message: `Do you want to remove ${args.cid} component?`
        }]);
        if (!answers) {
          this.logger.warning('Action canceled', 'CLI');
          return
        }
        if (answers.remove) {
          try {
            await plugin.removeComponent(args.cid);
            this.logger.system(`${args.cid} component successfully removed!`, 'CLI', 'success');
          } catch (e) {
            this.logger.system(e, 'CLI');
          }
          return
        }
      });
    })
    .argv;
}