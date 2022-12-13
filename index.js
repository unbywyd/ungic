#!/usr/bin/env node
let colors = require('colors');
let path = require("path");
let fs = require("fs");
let ungic = require("./bin");
let skeleton = require('./bin/modules/skeleton');
let readline = require('./bin/modules/readline');
const prompts = require('./bin/modules/prompt.js');
const servers = require('./bin/modules/server.js');
const Servers = new servers;
const fg = require('fast-glob');
const open = require('open');

let logger = function (options) {
  this.options = options;
  this.storage = new Map();
  //this.timers = new Map;
}
logger.prototype.decorate = function (message, label, color) {
  let strArray = message.split('\n');
  let c = colors[color] ? colors[color] : colors.cyan;
  strArray = strArray.map(el => c.bold('| ') + el);
  let closeLines = '';
  for (let i = 0; i < ((8 * 2) + label.length); i++) {
    closeLines += '-';
  }
  let output = c.bold(`------- ${label} -------`);
  output += ("\n" + strArray.join('\n'));
  output += ("\n" + c.bold(closeLines));

  if (this.storage.has(output)) {
    return
  }
  this.storage.set(output, label);
  this.publish(output, label);

  setTimeout(function () {
    this.storage.delete(output);
  }.bind(this), 1000);
}

logger.prototype.publish = function (message, label) {
  if (this.options.handler) {
    return this.options.handler(message, label);
  } else {
    console.log(message, label);
  }
}
logger.prototype.log = function (message, target) {
  let label = target ? 'Log: ' + target : 'Log';
  this.decorate(message, label, 'white');
}
logger.prototype.success = function (message, target) {
  let label = target ? 'Success: ' + target : 'Success';
  this.decorate(message, label, 'green');
}
logger.prototype.system = function (message, target, status) {
  let label = target ? 'System: ' + target : 'System';
  let color = 'cyan';
  if (message instanceof Error) {
    message = message.message;
    color = 'red';
  } else {
    if (status === false || status === 'error') {
      color = 'red';
    }
    if (status === true || status === 'success') {
      color = 'green';
    }
    if (status == 'warning') {
      color = 'yellow';
    }
  }
  this.decorate(message, label, color);
}
logger.prototype.warning = function (message, target) {
  let label = target ? 'Warning: ' + target : 'Warning';
  this.decorate(message, label, 'yellow');
}
logger.prototype.error = function (message, target) {
  if (message instanceof Error) {
    message = message.stack; //  message.name + ':' + message.message + '\n' +
  }
  let label = target ? 'Error: ' + target : 'Error';
  this.decorate(message, label, 'red');
}
class App extends skeleton {
  constructor() {
    super({}, {}, {
      command: ""
    });
    this.logger = new logger({
      handler: (message, label) => {
        if (this.rl) {
          message = '\n' + message;
        }
        console.log(message);
        if (this.rl) {
          this.rl.next();
        }
      }
    });
    let yargs = require('yargs')
      .option('verbose', {
        type: 'boolean',
        description: 'Run with verbose logging',
        default: false
      })
      .option('log', {
        alias: 'l',
        type: 'boolean',
        description: 'Enable log output to console',
        default: false
      })
      .option('mode', {
        alias: 'm',
        type: 'string',
        description: 'Providing the mode configuration. Manipulates NODE_ENV environment variable.',
        default: 'development'
      })
      .command('init', "Initialize an ungic project to an existing NPM project directory", args => {
        this.setConfig({
          command: 'init'
        });
      })
      .command('create <name>', "Create new a project", args => {
        this.setConfig({
          command: 'create'
        });
      })
      .command('release <release_name> [build_name]', "Release", yargs => {
        return yargs
          .option('silent', {
            type: 'boolean',
            description: 'Run release without configuration',
            default: true
          })
      }, args => {
        this.setConfig({
          command: 'release'
        });
      })
      .command('run [port]', "Launch current ungic project", yargs => {
        return yargs
          .option('open', {
            alias: 'o',
            type: 'boolean',
            description: 'Open start page in browser',
            default: true
          })
      }, args => {
        this.setConfig({
          command: 'run'
        });
      });

    let argv = yargs.argv;
    this.setConfig(argv);
  }
  async createReadline(func, opts) {
    this.rl = new readline(func, opts);
  }
  async initialize() {
    let config = this.config;

    if (['init', 'run', 'create', 'release'].indexOf(config.command) == -1) {
      console.log(colors.yellow.bold('To get started with ungic, you need to follow these simple steps:'));
      console.log(colors.yellow('● Go to working directory (an empty directory is recommended) ') + colors.yellow('and initialize a new project using ') + colors.yellow.bold('ungic init') + colors.yellow(' command. \n') + colors.yellow('Or create a new directory: ') + colors.yellow.bold('ungic create <projectName>'));
      console.log(colors.yellow('● Run the project using ') + colors.yellow.bold('ungic run') + colors.yellow(' command and start working with source files!'));
      require('yargs').showHelp();
      return;
    }
    this.app = new ungic(config);
    let self = this;

    if (config.log) {
      console.log(colors.cyan('Log output to console enabled. You can disable this option using the "log false" command.'));
    } else {
      console.log(colors.cyan('Log output to console disabled. You can enable this option using the "log true" command.'));
    }
    this.app.on('log', (type, message, args = {}) => {
      if (!config.log && ['system', 'error'].indexOf(type) == -1) { //  && ['success', 'error'].indexOf(type) == -1
        return;
      }
      if (type == 'system') {
        let message_type = args.message_type === undefined ? 'system' : args.message_type;
        this.logger.system(message, args.plugin_id ? args.plugin_id : false, message_type);
      } else {
        if (type == 'log') {
          this.logger.log(message, args.plugin_id ? args.plugin_id : false);
        } else if (type == 'error') {
          this.logger.error(message, args.plugin_id ? args.plugin_id : false);
        } else if (type == 'warning') {
          this.logger.warning(message, args.plugin_id ? args.plugin_id : false);
        } else if (type == 'success') {
          this.logger.success(message, args.plugin_id ? args.plugin_id : false);
        }
      }
      if (args.exit) {
        process.exit(0);
      }
    });
    this.on('log', (type, message, args = {}) => {
      if (!config.log && ['system'].indexOf(type) == -1) {
        return;
      }
      if (type == 'system') {
        let message_type = args.message_type === undefined ? 'system' : args.message_type;
        this.logger.system(message, message_type);
      } else {
        if (type == 'log') {
          this.logger.log(message);
        } else if (type == 'error') {
          this.logger.error(message);
        } else if (type == 'warning') {
          this.logger.warning(message);
        } else if (type == 'success') {
          this.logger.success(message);
        }
      }
    });
    if (config.command == 'create') {
      await this.app.createApp(config.name);
      process.exit();
      return
    }
    if (config.command == 'init') {
      await this.app.initialize();
    }
    if (config.command == 'run') {
      await this.app.begin();
    }
    if (config.command == 'release') {
      try {
        await this.app.begin({
          release: true
        });
        require('./bin/cli/release/').call(self, config).then(() => {
          process.exit();
        }).catch(e => {
          console.log(e);
          process.exit();
        });
      } catch (e) {
        console.log(e);
        process.exit();
      }
    } else {
      this.logger.success(`${this.app?.config?.name || ''} app running at: ${colors.cyan.bold(this.app.fastify.address)}`, 'Status');
      this.appMenu = async function (yargs) {
        yargs
          .command('release <release_name> [build_name]', 'Build a full release', yargs => {
            yargs.option('version', {
              alias: 'v',
              type: 'number',
              description: 'Release version'
            })
          }, args => {
            try {
              this.close();
              require('./bin/cli/release/').call(self, args).finally(() => {
                this.open();
              }).catch(e => {
                console.log(e);
              });
            } catch (e) {
              console.log(e);
            }
          })
          .command('info', 'Info about current project', args => {
          }, args => {
            try {
              self.logger.system(`Project: ${colors.green.bold(self.app.config.name)} v${colors.green.bold(self.app.config.version)} / ${config.mode}`);
            } catch (e) {
              console.log(e);
            }
          })
          .command('open [url]', 'Open url of project in Browser', args => {
          }, args => {
            try {
              args.url = args.url ? args.url : '/';
              open(self.app.fastify.address + (/^\//.test(args.url) ? args.url : '/' + args.url));
            } catch (e) {
              console.log(e);
            }
          })
          .command('server <path> [port]', 'Create or destroy a custom local server relative to this project', args => {
            args.option('close', {
              type: 'boolean',
              alias: 'c'
            });
            args.option('open', {
              type: 'boolean',
              alias: 'o',
              default: true
            });
          }, args => {
            try {
              let publicPath = path.join(self.app.project.root, args.path);
              if (/\.{2,}/.test(args.path)) {
                self.logger.system(new Error(`The path must be relative to the project`));
                return
              }
              if (!fs.existsSync(publicPath)) {
                self.logger.system(new Error(`${publicPath} path not exists`));
                return
              }
              if (args.close) {
                Servers.kill(publicPath).then(() => {
                  self.logger.log(colors.cyan.bold(`${publicPath} server successfully closed`));
                }).catch(e => {
                  self.logger.system(e);
                });
              } else {
                this.close();
                Servers.create(publicPath).then(e => {
                  self.logger.log(colors.cyan.bold('Server running at:' + e));
                  this.open();
                  if (args.open) {
                    open(e);
                  }
                }).catch(e => {
                  self.logger.system(e);
                  this.open();
                });
              }
            } catch (e) {
              console.log(e);
            }
          })
          .command('log <status>', 'Log output to the console', args => {
            args.positional('status', {
              describe: 'Enable or disable log output to console',
              type: 'boolean'
            });
          }, args => {
            try {
              let log = args.status;
              if (log != config.log) {
                config.log = log;
                if (log) {
                  self.logger.log(colors.cyan.bold('Log output to the console is activated'));
                } else {
                  self.logger.log(colors.cyan.bold('Log output to the console is deactivated'));
                }
              }
            } catch (e) {
              console.log(e);
            }
          });

        let cliModes = fg.sync('./bin/cli/*.js', { cwd: __dirname });
        if (cliModes.length) {
          for (let handler of cliModes) {
            let name = path.basename(handler, path.extname(handler));
            yargs
              .command(name, `switch to ${name} menu`, {}, () => {
                this.close().then(() => {
                  self.createReadline(async function (yargs) {
                    try {
                      require(handler).call(self, yargs, async (callback) => {
                        await this.close();
                        try {
                          await callback();
                        } catch (e) {
                          self.logger.error(e, 'CLI');
                        }
                        this.open();
                      });
                    } catch (e) {
                      console.log(e);
                    }
                  }, {
                    context: self,
                    prefix: name,
                    backCallback: () => {
                      self.createReadline(self.appMenu, {
                        context: self
                      });
                    }
                  });
                });
              });
          }
        }
        yargs.argv;
      }
      let htmlPlugin = this.app.project.plugins.get('html');
      let iconsPlugin = this.app.project.plugins.get('icons');
      let scssPlugin = this.app.project.plugins.get('scss');

      if (!fs.readdirSync(htmlPlugin.root).length && !fs.readdirSync(iconsPlugin.root).length && !fs.readdirSync(scssPlugin.root).length) {
        let answers = await prompts.call(this, [{
          type: 'confirm',
          name: 'install',
          message: `Do you want to install one of the demo projects to get started?`
        }]);
        if (answers && answers.install) {
          // install package
          let { demo, boilerplate } = require('./bin/cli/modules/install_packages');
          let response = await prompts.call(this, [{
            type: 'list',
            name: 'name',
            message: `Choose package to install`,
            validate: v => v.replace(/\s+/, '') !== '',
            choices: ["demo", 'boilerplate']
          }]);
          if (response && response.name) {
            if (response.name == 'demo') {
              await demo.call(this, { silence: 1 });
            }
            if (response.name == 'boilerplate') {
              await boilerplate.call(this, { silence: 1 });
            }
            this.system('Package installation completed!');
            await this.app.project.updateConfigFile(data => {
              delete data._visit;
              return data;
            });
          } else {
            this.system('The action was interrupted', 'warning');
          }
        }
      }
      if (!this.ready) {
        this.ready = true;
        this.createReadline(this.appMenu, {
          context: this
        });
      }
    }
  }
}

(async () => {
  let app = new App;
  try {
    await app.initialize();
  } catch (e) {
    console.log(e);
  }
})();